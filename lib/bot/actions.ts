"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { currentUser } from "@/lib/auth/session";
import { registerWebhook, readSettingsForm, rotateWebhookSecret, saveSettings, setEnabled, testBot, type SettingsResult } from "@/lib/bot/settings";
import { telegramLinkStart } from "@/lib/bot/link";
import { tryGetSql } from "@/lib/db/client";
import { isMissingSchema } from "@/lib/db/errors";
import { requestOrigin } from "@/lib/http/origin";
import { unlinkTelegram } from "@/lib/repositories/bot";

export type BotActionState = SettingsResult & { idle?: boolean; url?: string };

async function guarded(run: (sql: NonNullable<ReturnType<typeof tryGetSql>>) => Promise<BotActionState>, path = "/agentes/bot"): Promise<BotActionState> {
  const sql = tryGetSql();
  if (!sql) return { ok: false, message: "O banco não está ligado." };
  try {
    const result = await run(sql);
    revalidatePath(path);
    return result;
  } catch (error) {
    if (isMissingSchema(error)) return { ok: false, message: "As tabelas ainda não existem. Rode npm run db:migrate." };
    console.error("bot action failed", error instanceof Error ? error.name : "error");
    return { ok: false, message: "Algo falhou. Nada de segredo foi mostrado." };
  }
}

async function actorOrLogin() {
  const actor = await currentUser();
  if (!actor) redirect("/login");
  return actor;
}

export async function saveBotSettingsAction(_state: BotActionState, formData: FormData): Promise<BotActionState> {
  const actor = await actorOrLogin();
  return guarded((sql) => saveSettings(sql, actor, readSettingsForm(formData)));
}

export async function toggleBotAction(_state: BotActionState, formData: FormData): Promise<BotActionState> {
  const actor = await actorOrLogin();
  return guarded((sql) => setEnabled(sql, actor, formData.get("enabled") === "1"));
}

export async function rotateSecretAction(): Promise<BotActionState> {
  const actor = await actorOrLogin();
  return guarded((sql) => rotateWebhookSecret(sql, actor));
}

export async function registerWebhookAction(): Promise<BotActionState> {
  const actor = await actorOrLogin();
  const origin = await requestOrigin();
  return guarded((sql) => registerWebhook(sql, actor, origin));
}

export async function testBotAction(): Promise<BotActionState> {
  const actor = await actorOrLogin();
  return guarded((sql) => testBot(sql, actor));
}

/** One tap: a single-use code and the t.me link that opens the bot with it. */
export async function connectTelegramAction(): Promise<BotActionState> {
  const actor = await actorOrLogin();
  return guarded((sql) => telegramLinkStart(sql, actor), "/agentes");
}

export async function disconnectTelegramAction(): Promise<BotActionState> {
  const actor = await actorOrLogin();
  return guarded(async (sql) => {
    const removed = await unlinkTelegram(sql, actor.id);
    return { ok: removed, message: removed ? "Telegram desconectado." : "Seu Telegram não estava conectado." };
  }, "/agentes");
}
