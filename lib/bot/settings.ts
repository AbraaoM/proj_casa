/**
 * Bot settings, behind the admin page /agentes/bot. Kept apart from the server actions so the
 * rules are tested directly: only a master account, secrets only with CASA_SECRET_KEY, secrets
 * stored encrypted and never sent back (the screen gets the last 4 characters), every change logged
 * by field name.
 */
import { generateText } from "ai";
import type { AccountUser } from "@/lib/auth/types";
import { canManageAccounts } from "@/lib/auth/policy";
import { loadBotRuntime } from "@/lib/bot/config";
import { checkProvider, createModel, isAiProvider, SDK_FACTORIES, type ModelFactories } from "@/lib/bot/provider";
import { telegramClient, type FetchLike, type TgUser } from "@/lib/bot/telegram";
import type { Sql } from "@/lib/db/client";
import { logBotChange, readBotConfig, updateBotConfig, type BotConfigPatch } from "@/lib/repositories/bot";
import { encryptSecret, lastFour, newWebhookSecret, readMasterKey } from "@/lib/secrets/crypto";

export type SettingsResult = { ok: boolean; message: string; details?: string[] };

type Env = Record<string, string | undefined>;
export type SettingsDeps = { env?: Env; fetch?: FetchLike; factories?: ModelFactories };

const TELEGRAM_TOKEN = /^\d{5,15}:[A-Za-z0-9_-]{30,64}$/;
export const NOT_ADMIN = "Só a conta master configura o bot.";
export const NO_MASTER_KEY = "Defina CASA_SECRET_KEY no ambiente antes de salvar chaves. Nada foi salvo.";

export type SettingsInput = {
  provider: string;
  model: string;
  baseUrl: string;
  aiApiKey: string;
  telegramToken: string;
};

export function readSettingsForm(formData: FormData): SettingsInput {
  const text = (name: string) => {
    const value = formData.get(name);
    return typeof value === "string" ? value.trim() : "";
  };
  return { provider: text("provider"), model: text("model"), baseUrl: text("base_url"), aiApiKey: text("ai_api_key"), telegramToken: text("telegram_token") };
}

/** Saves provider, model, base URL and any secret pasted. A blank secret field keeps the saved one. */
export async function saveSettings(sql: Sql, actor: AccountUser | null, input: SettingsInput, deps: SettingsDeps = {}): Promise<SettingsResult> {
  if (!canManageAccounts(actor)) return { ok: false, message: NOT_ADMIN };
  if (!isAiProvider(input.provider)) return { ok: false, message: "Escolha um provedor da lista." };
  if (input.model.length > 120) return { ok: false, message: "O nome do modelo é longo demais." };
  const pastesSecret = Boolean(input.aiApiKey || input.telegramToken);
  const master = readMasterKey(deps.env ?? process.env);
  if (pastesSecret && !master.ok) return { ok: false, message: NO_MASTER_KEY };
  if (input.telegramToken && !TELEGRAM_TOKEN.test(input.telegramToken)) {
    return { ok: false, message: "Esse não parece um token do @BotFather (números, dois-pontos e o código)." };
  }
  if (input.aiApiKey && (input.aiApiKey.length < 8 || input.aiApiKey.length > 400 || /\s/.test(input.aiApiKey))) {
    return { ok: false, message: "Essa chave da API não parece válida." };
  }

  const { view, secrets } = await readBotConfig(sql);
  const hasKey = Boolean(input.aiApiKey || secrets.aiKeyEnc);
  // Validates provider, model and base URL; the key itself is only checked by "Testar".
  const check = checkProvider({ provider: input.provider, model: input.model, baseUrl: input.baseUrl || null, apiKey: "checked-separately" });
  if (!check.ok) return { ok: false, message: check.message };
  const model = check.value.model;
  const baseUrl = input.provider === "openai-compatible" ? check.value.baseUrl : null;

  const patch: BotConfigPatch = {};
  const fields: string[] = [];
  if (input.provider !== view.aiProvider) { patch.ai_provider = input.provider; fields.push("ai_provider"); }
  if (model && model !== view.aiModel) { patch.ai_model = model; fields.push("ai_model"); }
  if ((baseUrl ?? null) !== view.aiBaseUrl) { patch.ai_base_url = baseUrl; fields.push("ai_base_url"); }
  if (master.ok && input.aiApiKey) {
    patch.ai_api_key_enc = encryptSecret(input.aiApiKey, master.key);
    patch.ai_api_key_last4 = lastFour(input.aiApiKey);
    fields.push("ai_api_key");
  }
  if (master.ok && input.telegramToken) {
    patch.telegram_token_enc = encryptSecret(input.telegramToken, master.key);
    patch.telegram_token_last4 = lastFour(input.telegramToken);
    // Another bot: its name and webhook must be checked again.
    patch.bot_username = null;
    patch.webhook_registered_at = null;
    fields.push("telegram_token");
  }
  if (fields.length === 0) return { ok: true, message: "Nada mudou." };
  await updateBotConfig(sql, patch, actor!.id);
  await logBotChange(sql, actor!.id, "save", fields);
  return {
    ok: true,
    message: hasKey ? "Configuração salva." : "Configuração salva. Falta a chave da API do provedor de IA.",
  };
}

export async function setEnabled(sql: Sql, actor: AccountUser | null, enabled: boolean): Promise<SettingsResult> {
  if (!canManageAccounts(actor)) return { ok: false, message: NOT_ADMIN };
  await updateBotConfig(sql, { enabled }, actor!.id);
  await logBotChange(sql, actor!.id, enabled ? "enable" : "disable", ["enabled"]);
  return { ok: true, message: enabled ? "Bot ligado." : "Bot desligado. Ele ignora as mensagens até ser ligado de novo." };
}

/** New random webhook secret. Telegram only learns it on the next "Registrar webhook". */
export async function rotateWebhookSecret(sql: Sql, actor: AccountUser | null, deps: SettingsDeps = {}): Promise<SettingsResult> {
  if (!canManageAccounts(actor)) return { ok: false, message: NOT_ADMIN };
  const master = readMasterKey(deps.env ?? process.env);
  if (!master.ok) return { ok: false, message: NO_MASTER_KEY };
  const secret = newWebhookSecret();
  await updateBotConfig(sql, { webhook_secret_enc: encryptSecret(secret, master.key), webhook_secret_last4: lastFour(secret), webhook_registered_at: null }, actor!.id);
  await logBotChange(sql, actor!.id, "rotate_webhook_secret", ["webhook_secret"]);
  return { ok: true, message: "Segredo novo gerado. Toque em Registrar webhook para o Telegram usar o novo." };
}

/** Calls setWebhook with <origin>/api/telegram/webhook and the secret (created if missing). */
export async function registerWebhook(sql: Sql, actor: AccountUser | null, origin: string, deps: SettingsDeps = {}): Promise<SettingsResult> {
  if (!canManageAccounts(actor)) return { ok: false, message: NOT_ADMIN };
  let url: URL;
  try {
    url = new URL("/api/telegram/webhook", origin);
  } catch {
    return { ok: false, message: "Não consegui saber o endereço deste app." };
  }
  if (url.protocol !== "https:") {
    return { ok: false, message: "O Telegram só chama endereço https. Registre o webhook pela URL pública do deploy." };
  }
  const env = deps.env ?? process.env;
  let loaded = await loadBotRuntime(sql, env);
  if (!loaded.ok) return { ok: false, message: loaded.reason === "decrypt_failed" ? "Não consegui abrir as chaves salvas: a CASA_SECRET_KEY mudou. Cole as chaves de novo." : NO_MASTER_KEY };
  if (!loaded.runtime.telegramToken) return { ok: false, message: "Cole o token do bot e salve antes." };
  if (!loaded.runtime.webhookSecret) {
    const rotated = await rotateWebhookSecret(sql, actor, deps);
    if (!rotated.ok) return rotated;
    loaded = await loadBotRuntime(sql, env);
    if (!loaded.ok || !loaded.runtime.webhookSecret) return { ok: false, message: "Não consegui criar o segredo do webhook." };
  }
  const telegram = telegramClient(loaded.runtime.telegramToken!, deps.fetch);
  try {
    const me = await telegram.call<TgUser>("getMe");
    await telegram.call("setWebhook", {
      url: url.toString(),
      secret_token: loaded.runtime.webhookSecret,
      allowed_updates: ["message", "callback_query", "my_chat_member"],
    });
    await updateBotConfig(sql, { webhook_url: url.toString(), webhook_registered_at: new Date().toISOString(), bot_username: me.username ?? null }, actor!.id);
    await logBotChange(sql, actor!.id, "register_webhook", ["webhook_url"]);
    return { ok: true, message: `Webhook registrado para @${me.username ?? "bot"} em ${url.toString()}.` };
  } catch (error) {
    await logBotChange(sql, actor!.id, "register_webhook_failed", []);
    return { ok: false, message: `O Telegram recusou: ${error instanceof Error ? error.message : "erro"}.` };
  }
}

/** getMe on Telegram and a one-word reply from the AI model. Each part reports on its own. */
export async function testBot(sql: Sql, actor: AccountUser | null, deps: SettingsDeps = {}): Promise<SettingsResult> {
  if (!canManageAccounts(actor)) return { ok: false, message: NOT_ADMIN };
  const loaded = await loadBotRuntime(sql, deps.env ?? process.env);
  if (!loaded.ok) return { ok: false, message: loaded.reason === "decrypt_failed" ? "Não consegui abrir as chaves salvas: a CASA_SECRET_KEY mudou." : NO_MASTER_KEY };
  const details: string[] = [];
  let ok = true;

  if (!loaded.runtime.telegramToken) {
    ok = false;
    details.push("Telegram: falta o token.");
  } else {
    try {
      const me = await telegramClient(loaded.runtime.telegramToken, deps.fetch).call<TgUser>("getMe");
      if (me.username && me.username !== loaded.runtime.botUsername) await updateBotConfig(sql, { bot_username: me.username }, actor!.id);
      details.push(`Telegram: ok, @${me.username ?? "bot"}.`);
    } catch (error) {
      ok = false;
      details.push(`Telegram: ${error instanceof Error ? error.message : "falhou"}.`);
    }
  }

  if (!loaded.runtime.ai.ok) {
    ok = false;
    details.push(`IA: ${loaded.runtime.ai.message}`);
  } else {
    try {
      const model = await createModel(loaded.runtime.ai.value, deps.factories ?? SDK_FACTORIES);
      const reply = await generateText({ model, prompt: "Responda só com a palavra: ok", maxOutputTokens: 16, maxRetries: 0 });
      details.push(`IA: ok, ${loaded.runtime.ai.value.provider} / ${loaded.runtime.ai.value.model} respondeu "${reply.text.trim().slice(0, 20)}".`);
    } catch (error) {
      ok = false;
      const status = (error as { statusCode?: number }).statusCode;
      details.push(`IA: falhou${status ? ` (HTTP ${status})` : ""}. Confira o modelo e a chave.`);
    }
  }
  await logBotChange(sql, actor!.id, ok ? "test_ok" : "test_failed", []);
  return { ok, message: ok ? "Tudo certo." : "Algo falhou.", details };
}
