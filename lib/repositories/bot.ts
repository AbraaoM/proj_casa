import { createHash, randomBytes } from "node:crypto";
import type { Sql } from "@/lib/db/client";
import { DEFAULT_MODEL } from "@/lib/bot/provider";

/** bot_config without ciphertext: safe to send to the screen. */
export type BotConfigView = {
  enabled: boolean;
  aiProvider: string;
  aiModel: string;
  aiBaseUrl: string | null;
  aiKeyLast4: string | null;
  telegramTokenLast4: string | null;
  webhookSecretLast4: string | null;
  botUsername: string | null;
  webhookUrl: string | null;
  webhookRegisteredAt: string | null;
  updatedAt: string | null;
  updatedBy: string | null;
};

export type BotConfigSecrets = {
  aiKeyEnc: string | null;
  telegramTokenEnc: string | null;
  webhookSecretEnc: string | null;
};

const iso = (value: unknown) => (value == null ? null : value instanceof Date ? value.toISOString() : String(value));
const textOrNull = (value: unknown) => (value == null ? null : String(value));

export async function readBotConfig(sql: Sql): Promise<{ view: BotConfigView; secrets: BotConfigSecrets }> {
  const rows = await sql.query<Record<string, unknown>>(
    `SELECT c.*, u.username AS updated_by_name FROM bot_config c LEFT JOIN users u ON u.id = c.updated_by WHERE c.id = 1`,
  );
  const row = rows[0] ?? {};
  return {
    view: {
      enabled: row.enabled === true,
      aiProvider: String(row.ai_provider ?? "groq"),
      aiModel: String(row.ai_model ?? DEFAULT_MODEL),
      aiBaseUrl: textOrNull(row.ai_base_url),
      aiKeyLast4: textOrNull(row.ai_api_key_last4),
      telegramTokenLast4: textOrNull(row.telegram_token_last4),
      webhookSecretLast4: textOrNull(row.webhook_secret_last4),
      botUsername: textOrNull(row.bot_username),
      webhookUrl: textOrNull(row.webhook_url),
      webhookRegisteredAt: iso(row.webhook_registered_at),
      updatedAt: iso(row.updated_at),
      updatedBy: textOrNull(row.updated_by_name),
    },
    secrets: {
      aiKeyEnc: textOrNull(row.ai_api_key_enc),
      telegramTokenEnc: textOrNull(row.telegram_token_enc),
      webhookSecretEnc: textOrNull(row.webhook_secret_enc),
    },
  };
}

export type BotConfigPatch = Partial<{
  enabled: boolean;
  ai_provider: string;
  ai_model: string;
  ai_base_url: string | null;
  ai_api_key_enc: string | null;
  ai_api_key_last4: string | null;
  telegram_token_enc: string | null;
  telegram_token_last4: string | null;
  webhook_secret_enc: string | null;
  webhook_secret_last4: string | null;
  bot_username: string | null;
  webhook_url: string | null;
  webhook_registered_at: string | null;
}>;

const PATCH_COLUMNS = new Set([
  "enabled", "ai_provider", "ai_model", "ai_base_url", "ai_api_key_enc", "ai_api_key_last4",
  "telegram_token_enc", "telegram_token_last4", "webhook_secret_enc", "webhook_secret_last4",
  "bot_username", "webhook_url", "webhook_registered_at",
]);

export async function updateBotConfig(sql: Sql, patch: BotConfigPatch, userId: string | null): Promise<void> {
  const entries = Object.entries(patch).filter(([column]) => PATCH_COLUMNS.has(column));
  if (entries.length === 0) return;
  const params: unknown[] = [];
  const sets = entries.map(([column, value]) => {
    params.push(value);
    return `${column} = $${params.length}${column === "webhook_registered_at" ? "::timestamptz" : ""}`;
  });
  params.push(userId);
  // The row comes from migration 008; recreate it if someone deleted it.
  await sql.query("INSERT INTO bot_config (id) VALUES (1) ON CONFLICT (id) DO NOTHING");
  await sql.query(
    `UPDATE bot_config SET ${sets.join(", ")}, updated_by = $${params.length}::uuid, updated_at = now() WHERE id = 1`,
    params,
  );
}

/** Field names only. A secret value never reaches this table. */
export async function logBotChange(sql: Sql, userId: string | null, action: string, fields: string[]): Promise<void> {
  await sql.query("INSERT INTO bot_config_log (user_id, action, fields) VALUES ($1::uuid, $2, $3::text[])", [userId, action, fields]);
}

export type BotLogEntry = { action: string; fields: string[]; username: string | null; at: string };

export async function listBotLog(sql: Sql, limit = 10): Promise<BotLogEntry[]> {
  const rows = await sql.query<Record<string, unknown>>(
    `SELECT l.action, l.fields, u.username, l.created_at FROM bot_config_log l
     LEFT JOIN users u ON u.id = l.user_id ORDER BY l.id DESC LIMIT $1`,
    [limit],
  );
  return rows.map((row) => ({
    action: String(row.action),
    fields: Array.isArray(row.fields) ? row.fields.map(String) : [],
    username: textOrNull(row.username),
    at: iso(row.created_at) ?? "",
  }));
}

// ---------- link codes and links ----------

export const LINK_CODE_MINUTES = 15;

export function hashCode(code: string): string {
  return createHash("sha256").update(code).digest("hex");
}

/** A single-use code for t.me/<bot>?start=<code> (Telegram allows A-Z, a-z, 0-9, _ and -, up to 64). */
export async function createLinkCode(sql: Sql, userId: string): Promise<string> {
  const code = randomBytes(24).toString("base64url");
  await sql.query("DELETE FROM telegram_link_codes WHERE expires_at < now() OR (user_id = $1::uuid AND used_at IS NULL)", [userId]);
  await sql.query(
    `INSERT INTO telegram_link_codes (code_hash, user_id, expires_at) VALUES ($1, $2::uuid, now() + ($3 * interval '1 minute'))`,
    [hashCode(code), userId, LINK_CODE_MINUTES],
  );
  return code;
}

/** Marks the code used and returns its user, or null when unknown, used or expired. */
export async function consumeLinkCode(sql: Sql, code: string): Promise<string | null> {
  const rows = await sql.query<{ user_id: string }>(
    `UPDATE telegram_link_codes SET used_at = now()
     WHERE code_hash = $1 AND used_at IS NULL AND expires_at > now()
     RETURNING user_id::text AS user_id`,
    [hashCode(code)],
  );
  return rows[0]?.user_id ?? null;
}

export type TelegramLink = { userId: string; username: string; telegramUserId: number; privateChatId: number | null };

/** Links a Telegram account to a Casa account, replacing any older link of either. */
export async function linkTelegram(
  sql: Sql,
  input: { userId: string; telegramUserId: number; privateChatId: number | null; telegramName: string | null },
): Promise<void> {
  await sql.query(
    "UPDATE telegram_links SET revoked_at = now() WHERE revoked_at IS NULL AND (user_id = $1::uuid OR telegram_user_id = $2)",
    [input.userId, input.telegramUserId],
  );
  await sql.query(
    "INSERT INTO telegram_links (user_id, telegram_user_id, private_chat_id, telegram_name) VALUES ($1::uuid, $2, $3, $4)",
    [input.userId, input.telegramUserId, input.privateChatId, input.telegramName],
  );
}

export async function findLinkByTelegramUser(sql: Sql, telegramUserId: number): Promise<TelegramLink | null> {
  const rows = await sql.query<Record<string, unknown>>(
    `SELECT l.user_id::text AS user_id, u.username, l.telegram_user_id, l.private_chat_id
     FROM telegram_links l JOIN users u ON u.id = l.user_id
     WHERE l.telegram_user_id = $1 AND l.revoked_at IS NULL`,
    [telegramUserId],
  );
  const row = rows[0];
  if (!row) return null;
  return {
    userId: String(row.user_id),
    username: String(row.username),
    telegramUserId: Number(row.telegram_user_id),
    privateChatId: row.private_chat_id == null ? null : Number(row.private_chat_id),
  };
}

export async function setPrivateChat(sql: Sql, telegramUserId: number, chatId: number): Promise<void> {
  await sql.query("UPDATE telegram_links SET private_chat_id = $2 WHERE telegram_user_id = $1 AND revoked_at IS NULL", [telegramUserId, chatId]);
}

export async function findLinkByUser(sql: Sql, userId: string): Promise<{ telegramName: string | null; linkedAt: string } | null> {
  const rows = await sql.query<Record<string, unknown>>(
    "SELECT telegram_name, linked_at FROM telegram_links WHERE user_id = $1::uuid AND revoked_at IS NULL",
    [userId],
  );
  const row = rows[0];
  return row ? { telegramName: textOrNull(row.telegram_name), linkedAt: iso(row.linked_at) ?? "" } : null;
}

export async function unlinkTelegram(sql: Sql, userId: string): Promise<boolean> {
  const rows = await sql.query("UPDATE telegram_links SET revoked_at = now() WHERE user_id = $1::uuid AND revoked_at IS NULL RETURNING id", [userId]);
  return rows.length > 0;
}

// ---------- the bot's own key per person (attribution and the agent's name) ----------

export const DEFAULT_AGENT_NAME = "Agente";

/** The person's Telegram agent key: created on first use, label = the name they gave the bot. */
export async function ensureTelegramKey(sql: Sql, userId: string): Promise<{ keyId: string; agentName: string }> {
  const found = await sql.query<{ id: string; label: string }>(
    "SELECT id::text AS id, label FROM agent_keys WHERE created_by = $1::uuid AND kind = 'telegram' AND revoked_at IS NULL",
    [userId],
  );
  if (found[0]) return { keyId: found[0].id, agentName: found[0].label };
  // The secret is random and thrown away: this key is never presented over HTTP.
  const secret = randomBytes(32).toString("base64url");
  const rows = await sql.query<{ id: string; label: string }>(
    `INSERT INTO agent_keys (label, key_prefix, key_hash, created_by, kind)
     VALUES ($1, 'telegram', $2, $3::uuid, 'telegram')
     ON CONFLICT (created_by) WHERE kind = 'telegram' AND revoked_at IS NULL DO UPDATE SET label = agent_keys.label
     RETURNING id::text AS id, label`,
    [DEFAULT_AGENT_NAME, createHash("sha256").update(secret).digest("hex"), userId],
  );
  return { keyId: rows[0]!.id, agentName: rows[0]!.label };
}

export async function renameTelegramAgent(sql: Sql, userId: string, name: string): Promise<void> {
  await sql.query(
    "UPDATE agent_keys SET label = $2 WHERE created_by = $1::uuid AND kind = 'telegram' AND revoked_at IS NULL",
    [userId, name],
  );
}

// ---------- chats, memory, updates ----------

export async function upsertChat(sql: Sql, chat: { id: number; kind: "private" | "group" | "supergroup"; title: string | null; active?: boolean }): Promise<void> {
  await sql.query(
    `INSERT INTO telegram_chats (chat_id, kind, title, active) VALUES ($1, $2, $3, $4)
     ON CONFLICT (chat_id) DO UPDATE SET kind = EXCLUDED.kind, title = EXCLUDED.title, active = EXCLUDED.active, updated_at = now()`,
    [chat.id, chat.kind, chat.title, chat.active ?? true],
  );
}

export async function setChatDigest(sql: Sql, chatId: number, digest: boolean): Promise<void> {
  await sql.query("UPDATE telegram_chats SET digest = $2, updated_at = now() WHERE chat_id = $1", [chatId, digest]);
}

/**
 * Where the daily summary goes today: the active family groups; if there is none, the private chat
 * of each linked person. Each chat at most once per day.
 */
export async function claimDigestChats(sql: Sql, today: string): Promise<number[]> {
  const groups = await sql.query<{ chat_id: unknown }>(
    `SELECT chat_id FROM telegram_chats WHERE active AND digest AND kind IN ('group', 'supergroup')`,
  );
  const candidates = groups.length > 0
    ? groups.map((row) => Number(row.chat_id))
    : (await sql.query<{ chat_id: unknown }>(
        `SELECT DISTINCT l.private_chat_id AS chat_id FROM telegram_links l
         LEFT JOIN telegram_chats c ON c.chat_id = l.private_chat_id
         WHERE l.revoked_at IS NULL AND l.private_chat_id IS NOT NULL AND COALESCE(c.digest, true) AND COALESCE(c.active, true)`,
      )).map((row) => Number(row.chat_id));
  const claimed: number[] = [];
  for (const chatId of candidates) {
    const rows = await sql.query(
      `INSERT INTO telegram_chats (chat_id, kind, last_digest_on) VALUES ($1, 'private', $2::date)
       ON CONFLICT (chat_id) DO UPDATE SET last_digest_on = $2::date, updated_at = now()
       WHERE telegram_chats.last_digest_on IS DISTINCT FROM $2::date
       RETURNING chat_id`,
      [chatId, today],
    );
    if (rows.length > 0) claimed.push(chatId);
  }
  return claimed;
}

export type StoredMessage = { role: "user" | "assistant"; author: string | null; content: string };

export async function addMessage(sql: Sql, message: { chatId: number; userId: string | null; role: "user" | "assistant"; author: string | null; content: string }): Promise<void> {
  const content = message.content.slice(0, 4000);
  if (!content.trim()) return;
  await sql.query(
    "INSERT INTO agent_messages (chat_id, user_id, role, author, content) VALUES ($1, $2::uuid, $3, $4, $5)",
    [message.chatId, message.userId, message.role, message.author, content],
  );
}

/** The last messages of a chat, oldest first. */
export async function recentMessages(sql: Sql, chatId: number, limit: number): Promise<StoredMessage[]> {
  const rows = await sql.query<Record<string, unknown>>(
    "SELECT role, author, content FROM agent_messages WHERE chat_id = $1 ORDER BY id DESC LIMIT $2",
    [chatId, limit],
  );
  return rows.reverse().map((row) => ({ role: row.role === "assistant" ? "assistant" : "user", author: textOrNull(row.author), content: String(row.content) }));
}

export const MESSAGE_RETENTION_DAYS = 30;

export async function purgeOldBotData(sql: Sql): Promise<void> {
  await sql.query(`DELETE FROM agent_messages WHERE created_at < now() - ($1 * interval '1 day')`, [MESSAGE_RETENTION_DAYS]);
  await sql.query("DELETE FROM telegram_updates WHERE received_at < now() - interval '2 days'");
  await sql.query("DELETE FROM telegram_link_codes WHERE expires_at < now() - interval '1 day'");
}

/** True the first time an update id is seen. */
export async function claimUpdate(sql: Sql, updateId: number): Promise<boolean> {
  const rows = await sql.query("INSERT INTO telegram_updates (update_id) VALUES ($1) ON CONFLICT DO NOTHING RETURNING update_id", [updateId]);
  return rows.length > 0;
}
