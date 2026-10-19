import { handleTelegramUpdate } from "@/lib/bot/webhook";
import { loadBotRuntime, sameSecret, webhookDeps } from "@/lib/bot/runtime";
import type { TgUpdate } from "@/lib/bot/telegram";
import { tryGetSql } from "@/lib/db/client";

export const maxDuration = 60;

/**
 * Telegram calls this for every update. The X-Telegram-Bot-Api-Secret-Token header must match
 * the webhook secret saved on the bot settings page (https://core.telegram.org/bots/api#setwebhook).
 * After the check it always answers 200, so Telegram does not resend an update that failed here.
 */
export async function POST(request: Request) {
  const sql = tryGetSql();
  if (!sql) return Response.json({ ok: false, error: { code: "database_unavailable" } }, { status: 503 });
  const loaded = await loadBotRuntime(sql).catch(() => null);
  if (!loaded?.ok) return Response.json({ ok: false, error: { code: "bot_not_configured" } }, { status: 503 });
  const { runtime } = loaded;
  if (!sameSecret(request.headers.get("x-telegram-bot-api-secret-token"), runtime.webhookSecret)) {
    return Response.json({ ok: false, error: { code: "unauthorized" } }, { status: 401 });
  }
  if (!runtime.enabled || !runtime.telegramToken) return Response.json({ ok: true, ignored: "disabled" });

  let update: TgUpdate;
  try {
    update = (await request.json()) as TgUpdate;
  } catch {
    return Response.json({ ok: true, ignored: "bad_json" });
  }
  if (typeof update?.update_id !== "number") return Response.json({ ok: true, ignored: "no_update_id" });
  try {
    await handleTelegramUpdate(update, webhookDeps(sql, runtime));
  } catch (error) {
    console.error("telegram update failed", error instanceof Error ? error.name : "error");
  }
  return Response.json({ ok: true });
}
