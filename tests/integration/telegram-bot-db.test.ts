/**
 * The Telegram bot on a real Postgres, with Telegram and the AI model mocked (no token, no network):
 * encrypted settings, linking by one-tap code, private chat and family group, attribution to the
 * person who wrote, answers in private, the "Feito" button with the cost question, the daily summary.
 *
 *   TEST_DATABASE_URL=postgresql://casa:casa@localhost:5432/casa_test npx vitest run tests/integration/telegram-bot-db.test.ts
 */
import { randomBytes } from "node:crypto";
import { MockLanguageModelV3 } from "ai/test";
import type { LanguageModelV3Content, LanguageModelV3GenerateResult } from "@ai-sdk/provider";
import { beforeAll, beforeEach, describe, expect, test, vi } from "vitest";
import { createSql, type Sql } from "@/lib/db/client";
import { applyMigrations } from "@/lib/db/migrate";
import type { AccountUser } from "@/lib/auth/types";
import type { TelegramClient, TgUpdate } from "@/lib/bot/telegram";
import type { ModelFactories } from "@/lib/bot/provider";

const url = process.env.TEST_DATABASE_URL;
const MASTER = randomBytes(32).toString("base64");
const TOKEN = "123456789:FAKEtokenFORtestsONLY_abcdefghijk1234";
const AI_KEY = "gsk_fake_key_for_tests_only_9f3a";
const GROUP = -100777;
const ADMIN_TG = 5001;
const MEMBER_TG = 5002;
const STRANGER_TG = 5009;
const today = "2026-10-18";
const clock = { now: "2026-10-18T12:00:00.000Z", timeZone: "America/Sao_Paulo" };

type Sent = { method: string; body: Record<string, unknown> };

function usage(): LanguageModelV3GenerateResult["usage"] {
  return { inputTokens: { total: 10, noCache: 10, cacheRead: 0, cacheWrite: 0 }, outputTokens: { total: 5, text: 5, reasoning: 0 } };
}

/** A model that plays the given steps in order: each step is text or a tool call. */
function scripted(steps: Array<string | { tool: string; input: Record<string, unknown> }>) {
  let i = 0;
  const prompts: unknown[] = [];
  const model = new MockLanguageModelV3({
    doGenerate: async (options) => {
      prompts.push(options.prompt);
      const step = steps[Math.min(i, steps.length - 1)]!;
      i += 1;
      const content: LanguageModelV3Content[] =
        typeof step === "string"
          ? [{ type: "text", text: step }]
          : [{ type: "tool-call", toolCallId: `call-${i}`, toolName: step.tool, input: JSON.stringify(step.input) }];
      return { content, finishReason: { unified: typeof step === "string" ? "stop" : "tool-calls", raw: undefined }, usage: usage(), warnings: [] };
    },
  });
  return { model, prompts };
}

describe.skipIf(!url)("telegram bot", () => {
  let sql: Sql;
  let admin: AccountUser;
  let member: AccountUser;
  let sent: Sent[] = [];
  let updateId = 1;
  let model = scripted(["oi"]).model;
  const telegram: TelegramClient = {
    async call<T>(method: string, body: Record<string, unknown> = {}) {
      sent.push({ method, body });
      return (method === "getMe" ? { id: 1, is_bot: true, username: "casa_teste_bot" } : true) as T;
    },
  };

  const n = async (query: string, params: unknown[] = []) => Number((await sql.query<{ n: unknown }>(query, params))[0]?.n ?? 0);
  const deps = () => ({
    sql,
    telegram,
    botUsername: "casa_teste_bot",
    model: async () => ({ ok: true as const, model }),
    context: async () => ({ sql, today, clock }),
  });
  const text = (chat: { id: number; type: "private" | "group" | "supergroup" }, fromId: number, body: string, extra: Record<string, unknown> = {}): TgUpdate => ({
    update_id: updateId++,
    message: { message_id: updateId, from: { id: fromId, first_name: fromId === MEMBER_TG ? "Pessoa" : "Dono" }, chat: { ...chat, title: chat.type === "private" ? undefined : "Família" }, text: body, ...extra },
  });
  const handle = async (update: TgUpdate) => {
    const { handleTelegramUpdate } = await import("@/lib/bot/webhook");
    await handleTelegramUpdate(update, deps());
  };
  const messages = () => sent.filter((entry) => entry.method === "sendMessage");
  const fakeFetch = async (input: string, init?: RequestInit) => {
    const method = input.split("/").pop()!;
    sent.push({ method, body: JSON.parse(String(init?.body ?? "{}")) });
    const result = method === "getMe" ? { id: 1, is_bot: true, username: "casa_teste_bot" } : true;
    return new Response(JSON.stringify({ ok: true, result }), { status: 200 });
  };

  beforeAll(async () => {
    if (!url || !/test/.test(url)) throw new Error("TEST_DATABASE_URL must name a test database.");
    vi.stubEnv("DATABASE_DRIVER", "pg");
    vi.stubEnv("DATABASE_URL", url);
    vi.stubEnv("CASA_SECRET_KEY", MASTER);
    sql = createSql(url);
    await sql.query("DROP SCHEMA IF EXISTS public CASCADE");
    await sql.query("CREATE SCHEMA public");
    await applyMigrations(sql);
    const { insertFirstUser, insertUser } = await import("@/lib/repositories/accounts");
    admin = (await insertFirstUser(sql, "dono", "senha-segura-1"))!;
    member = await insertUser(sql, "pessoa", "senha-segura-2");
  });

  beforeEach(() => {
    sent = [];
  });

  test("settings: admin saves secrets encrypted, shown only as the last 4, every change logged without values", async () => {
    const { saveSettings } = await import("@/lib/bot/settings");
    const input = { provider: "groq", model: "", baseUrl: "", aiApiKey: AI_KEY, telegramToken: TOKEN };
    expect((await saveSettings(sql, member, input)).ok).toBe(false);
    expect(await saveSettings(sql, admin, { ...input, telegramToken: "não-é-token" })).toMatchObject({ ok: false });
    expect(await saveSettings(sql, admin, input)).toEqual({ ok: true, message: "Configuração salva." });

    const [row] = await sql.query<Record<string, string>>("SELECT * FROM bot_config");
    const dump = JSON.stringify(row);
    expect(dump).not.toContain(TOKEN);
    expect(dump).not.toContain(AI_KEY);
    expect(row!.telegram_token_enc).toMatch(/^v1:/);
    expect(row!.ai_api_key_last4).toBe("9f3a");

    const { readBotConfig, listBotLog } = await import("@/lib/repositories/bot");
    const { view } = await readBotConfig(sql);
    expect(JSON.stringify(view)).not.toContain(TOKEN);
    expect(view).toMatchObject({ aiProvider: "groq", aiKeyLast4: "9f3a", telegramTokenLast4: TOKEN.slice(-4), enabled: false });
    const log = await listBotLog(sql);
    expect(log[0]).toMatchObject({ action: "save", username: "dono", fields: expect.arrayContaining(["ai_api_key", "telegram_token"]) });
    expect(JSON.stringify(await sql.query("SELECT * FROM bot_config_log"))).not.toContain(AI_KEY);

    // Blank secret fields keep what is saved.
    expect(await saveSettings(sql, admin, { ...input, aiApiKey: "", telegramToken: "", model: "outro-modelo" })).toMatchObject({ ok: true });
    expect((await readBotConfig(sql)).view).toMatchObject({ aiModel: "outro-modelo", aiKeyLast4: "9f3a" });
    await saveSettings(sql, admin, { ...input, aiApiKey: "", telegramToken: "" });
  });

  test("runtime decrypts with the right key only", async () => {
    const { loadBotRuntime } = await import("@/lib/bot/config");
    const loaded = await loadBotRuntime(sql, { CASA_SECRET_KEY: MASTER });
    expect(loaded.ok && loaded.runtime.telegramToken).toBe(TOKEN);
    expect(loaded.ok && loaded.runtime.ai.ok).toBe(true);
    expect(await loadBotRuntime(sql, {})).toEqual({ ok: false, reason: "master_key_missing" });
    expect(await loadBotRuntime(sql, { CASA_SECRET_KEY: randomBytes(32).toString("base64") })).toEqual({ ok: false, reason: "decrypt_failed" });
  });

  test("Registrar webhook sends the app URL and the secret; Testar checks Telegram and the model", async () => {
    const { registerWebhook, testBot, setEnabled } = await import("@/lib/bot/settings");
    const result = await registerWebhook(sql, admin, "https://casa.exemplo.test", { fetch: fakeFetch });
    expect(result).toMatchObject({ ok: true, message: expect.stringContaining("@casa_teste_bot") });
    const call = sent.find((entry) => entry.method === "setWebhook")!;
    expect(call.body).toMatchObject({ url: "https://casa.exemplo.test/api/telegram/webhook", allowed_updates: ["message", "callback_query", "my_chat_member"] });
    const { loadBotRuntime } = await import("@/lib/bot/config");
    const loaded = await loadBotRuntime(sql);
    expect(loaded.ok && call.body.secret_token).toBe(loaded.ok ? loaded.runtime.webhookSecret : "");

    const factories = Object.fromEntries(["groq", "openai", "anthropic", "google", "openrouter", "openai-compatible"].map((name) => [name, () => scripted(["ok"]).model])) as unknown as ModelFactories;
    const tested = await testBot(sql, admin, { fetch: fakeFetch, factories });
    expect(tested.ok).toBe(true);
    expect(tested.details?.join(" ")).toContain('respondeu "ok"');
    expect(JSON.stringify(tested)).not.toContain(TOKEN);

    expect(await setEnabled(sql, admin, true)).toMatchObject({ ok: true });
  });

  test("webhook route: wrong secret is 401; disabled bot ignores the update", async () => {
    const { POST } = await import("@/app/api/telegram/webhook/route");
    const update = JSON.stringify({ update_id: 999999, message: { message_id: 1, chat: { id: 1, type: "private" }, text: "oi" } });
    expect((await POST(new Request("http://localhost/api/telegram/webhook", { method: "POST", body: update }))).status).toBe(401);
    expect((await POST(new Request("http://localhost/api/telegram/webhook", { method: "POST", headers: { "x-telegram-bot-api-secret-token": "errado" }, body: update }))).status).toBe(401);
    const { loadBotRuntime } = await import("@/lib/bot/config");
    const loaded = await loadBotRuntime(sql);
    const secret = loaded.ok ? loaded.runtime.webhookSecret! : "";
    const { setEnabled } = await import("@/lib/bot/settings");
    await setEnabled(sql, admin, false);
    const response = await POST(new Request("http://localhost/api/telegram/webhook", { method: "POST", headers: { "x-telegram-bot-api-secret-token": secret }, body: update }));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true, ignored: "disabled" });
    await setEnabled(sql, admin, true);
  });

  test("Conectar Telegram: a single-use code links the Telegram user to the Casa account", async () => {
    const { telegramLinkStart } = await import("@/lib/bot/link");
    const start = await telegramLinkStart(sql, member);
    expect(start.url).toMatch(/^https:\/\/t\.me\/casa_teste_bot\?start=[A-Za-z0-9_-]{20,64}$/);
    const code = new URL(start.url!).searchParams.get("start")!;

    await handle(text({ id: MEMBER_TG, type: "private" }, MEMBER_TG, `/start ${code}`));
    expect(messages().at(-1)!.body.text).toContain("Pronto, pessoa");
    expect(await n("SELECT count(*)::int AS n FROM telegram_links WHERE user_id = $1::uuid AND telegram_user_id = $2 AND revoked_at IS NULL", [member.id, MEMBER_TG])).toBe(1);

    // The code works once.
    await handle(text({ id: STRANGER_TG, type: "private" }, STRANGER_TG, `/start ${code}`));
    expect(messages().at(-1)!.body.text).toContain("já foi usado");

    const adminStart = await telegramLinkStart(sql, admin);
    await handle(text({ id: ADMIN_TG, type: "private" }, ADMIN_TG, `/start ${new URL(adminStart.url!).searchParams.get("start")}`));
  });

  test("unlinked senders: answered politely in private; in the group only when they call the bot", async () => {
    await handle(text({ id: STRANGER_TG, type: "private" }, STRANGER_TG, "oi"));
    expect(messages().at(-1)!.body.text).toContain("Conectar Telegram");
    sent = [];
    await handle(text({ id: GROUP, type: "supergroup" }, STRANGER_TG, "bom dia, gente"));
    expect(messages()).toHaveLength(0);
    await handle(text({ id: GROUP, type: "supergroup" }, STRANGER_TG, "@casa_teste_bot oi"));
    expect(messages()).toHaveLength(1);
    expect(messages()[0]!.body).toMatchObject({ chat_id: GROUP, reply_parameters: expect.any(Object) });
  });

  test("group: not addressed is kept as context; addressed acts as the sender, through their own agent key", async () => {
    await handle(text({ id: GROUP, type: "supergroup" }, MEMBER_TG, "precisamos trocar o filtro"));
    expect(messages()).toHaveLength(0);
    expect(await n("SELECT count(*)::int AS n FROM agent_messages WHERE chat_id = $1 AND content = 'precisamos trocar o filtro'", [GROUP])).toBe(1);

    const run = scripted([{ tool: "adicionar_item", input: { domain: "house", title: "Trocar filtro", category: "filter", due_date: today } }, "Anotei: Trocar filtro, hoje."]);
    model = run.model;
    await handle(text({ id: GROUP, type: "supergroup" }, MEMBER_TG, "@casa_teste_bot anota isso pra hoje"));
    expect(messages().at(-1)!.body).toMatchObject({ chat_id: GROUP, text: "Anotei: Trocar filtro, hoje." });
    // The earlier group message reached the model as context, with its author.
    expect(JSON.stringify(run.prompts[0])).toContain("Pessoa: precisamos trocar o filtro");

    const [row] = await sql.query<{ u: string; kind: string; label: string }>(
      `SELECT i.created_by_user_id::text AS u, k.kind, k.label FROM care_items i JOIN agent_keys k ON k.id = i.agent_key_id WHERE i.title = 'Trocar filtro'`,
    );
    expect(row).toEqual({ u: member.id, kind: "telegram", label: "Agente" });
    expect(await n("SELECT count(*)::int AS n FROM agent_activity WHERE channel = 'telegram' AND user_id = $1::uuid AND action = 'tool adicionar_item'", [member.id])).toBe(1);
    // The bot's internal key is not listed with the HTTP keys.
    const { listAgentKeys } = await import("@/lib/repositories/agent-keys");
    expect((await listAgentKeys(sql)).some((key) => key.prefix === "telegram")).toBe(false);
  });

  test("group: a personal matter is answered in private", async () => {
    model = scripted([{ tool: "responder_no_privado", input: { text: "Seu remédio é às 20h." } }, ""]).model;
    await handle(text({ id: GROUP, type: "supergroup" }, MEMBER_TG, "@casa_teste_bot que horas é meu remédio?"));
    const out = messages();
    expect(out.find((entry) => entry.body.chat_id === MEMBER_TG)!.body.text).toBe("Seu remédio é às 20h.");
    expect(out.find((entry) => entry.body.chat_id === GROUP)!.body.text).toBe("Te respondi no privado.");
  });

  test("the person names their agent; the name is stored and used to call it in the group", async () => {
    model = scripted([{ tool: "definir_meu_nome", input: { name: "Bebê" } }, "Pode me chamar de Bebê."]).model;
    await handle(text({ id: MEMBER_TG, type: "private" }, MEMBER_TG, "quero te chamar de Bebê"));
    expect(await n("SELECT count(*)::int AS n FROM agent_keys WHERE created_by = $1::uuid AND kind = 'telegram' AND label = 'Bebê'", [member.id])).toBe(1);
    sent = [];
    model = scripted(["Oi!"]).model;
    await handle(text({ id: GROUP, type: "supergroup" }, MEMBER_TG, "Bebê, tudo certo?"));
    expect(messages()).toHaveLength(1);
  });

  test("km and a future oil date the person states show on the car page", async () => {
    const { createVehicle } = await import("@/lib/services/subjects");
    const car = await createVehicle(sql, { name: "Onix", make: null, model: null, year: null, plate: null, odometer_km: null, notes: null });
    model = scripted([
      {
        tool: "adicionar_item",
        input: { domain: "car", vehicle_id: car.id, title: "Troca de óleo", category: "oil", due_date: "2026-12-15", odometer_km: 45200 },
      },
      "Anotei: 45.200 km e troca de óleo em 15/12.",
    ]).model;
    await handle(text({ id: MEMBER_TG, type: "private" }, MEMBER_TG, "o carro está com 45200 km, próxima troca de óleo dia 2026-12-15"));

    const [vehicle] = await sql.query<{ odometer_km: number | null }>("SELECT odometer_km FROM vehicles WHERE id = $1::uuid", [car.id]);
    expect(vehicle?.odometer_km).toBe(45200);
    const items = await sql.query<{ title: string; category: string; due_date: string; status: string }>(
      "SELECT title, category, due_date::text AS due_date, status FROM care_items WHERE vehicle_id = $1::uuid",
      [car.id],
    );
    expect(items).toEqual([expect.objectContaining({ title: "Troca de óleo", category: "oil", due_date: "2026-12-15", status: "active" })]);
    const events = await sql.query("SELECT id FROM care_events WHERE vehicle_id = $1::uuid AND category = 'oil'", [car.id]);
    expect(events).toEqual([]);
    expect(messages().at(-1)!.body.text).toContain("Anotei");
  });

  test("the same update twice is handled once", async () => {
    model = scripted(["Oi!"]).model;
    const update = text({ id: MEMBER_TG, type: "private" }, MEMBER_TG, "oi");
    await handle(update);
    await handle(update);
    expect(messages()).toHaveLength(1);
  });

  test("daily summary goes to the group once a day; its Feito button marks as the person who tapped and asks the cost", async () => {
    const { sendDailyDigest } = await import("@/lib/bot/digest");
    expect(await sendDailyDigest({ sql, telegram, today, clock })).toEqual({ sent: 1, failed: 0 });
    const digest = messages()[0]!;
    expect(digest.body.chat_id).toBe(GROUP);
    expect(String(digest.body.text)).toContain("Trocar filtro");
    const buttons = (digest.body.reply_markup as { inline_keyboard: Array<Array<{ callback_data: string }>> }).inline_keyboard;
    const data = buttons[0]![0]!.callback_data;
    expect(await sendDailyDigest({ sql, telegram, today, clock })).toEqual({ sent: 0, failed: 0 });

    sent = [];
    const tap = (id: number): TgUpdate => ({ update_id: updateId++, callback_query: { id: `cb${id}`, from: { id: ADMIN_TG, first_name: "Dono" }, data, message: { message_id: 1, chat: { id: GROUP, type: "supergroup" } } } });
    await handle(tap(1));
    expect(sent.find((entry) => entry.method === "answerCallbackQuery")!.body.text).toBe("Trocar filtro: feito");
    expect(messages().at(-1)!.body.text).toBe("Dono, quanto custou Trocar filtro? Se não teve custo, é só dizer.");
    const [event] = await sql.query<{ u: string }>("SELECT e.created_by_user_id::text AS u FROM care_events e JOIN care_items i ON i.id = e.care_item_id WHERE i.title = 'Trocar filtro'");
    expect(event!.u).toBe(admin.id);
    expect(await n("SELECT count(*)::int AS n FROM fin_transactions")).toBe(0);

    sent = [];
    await handle(tap(2));
    expect(sent.find((entry) => entry.method === "answerCallbackQuery")!.body.text).toBe("Já estava marcado.");
    expect(messages()).toHaveLength(0);
  });

  test("/resumo_off stops the summary in that chat", async () => {
    await handle(text({ id: GROUP, type: "supergroup" }, MEMBER_TG, "/resumo_off@casa_teste_bot"));
    expect(messages().at(-1)!.body.text).toContain("não mando mais");
    expect(await n("SELECT count(*)::int AS n FROM telegram_chats WHERE chat_id = $1 AND NOT digest", [GROUP])).toBe(1);
  });

  test("Desconectar: the Telegram user is unknown again", async () => {
    const { unlinkTelegram } = await import("@/lib/repositories/bot");
    expect(await unlinkTelegram(sql, member.id)).toBe(true);
    await handle(text({ id: MEMBER_TG, type: "private" }, MEMBER_TG, "oi"));
    expect(messages().at(-1)!.body.text).toContain("Conectar Telegram");
  });
});
