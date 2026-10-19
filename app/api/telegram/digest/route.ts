import { sendDailyDigest } from "@/lib/bot/digest";
import { householdContext, loadBotRuntime, sameSecret } from "@/lib/bot/runtime";
import { telegramClient } from "@/lib/bot/telegram";
import { tryGetSql } from "@/lib/db/client";

export const maxDuration = 60;

/**
 * Daily summary, called by Vercel Cron (vercel.json; on Hobby once a day, ±59 min).
 * If CRON_SECRET is set in Vercel, its Authorization header is required. Without it the route
 * still sends at most one summary per chat per day, so a stray call cannot spam anyone.
 */
export async function GET(request: Request) {
  const cronSecret = process.env.CRON_SECRET?.trim();
  if (cronSecret && !sameSecret(request.headers.get("authorization"), `Bearer ${cronSecret}`)) {
    return Response.json({ ok: false, error: { code: "unauthorized" } }, { status: 401 });
  }
  const sql = tryGetSql();
  if (!sql) return Response.json({ ok: false, error: { code: "database_unavailable" } }, { status: 503 });
  const loaded = await loadBotRuntime(sql).catch(() => null);
  if (!loaded?.ok || !loaded.runtime.enabled || !loaded.runtime.telegramToken) return Response.json({ ok: true, sent: 0, skipped: "bot_disabled" });
  const context = await householdContext(sql);
  const result = await sendDailyDigest({ sql, telegram: telegramClient(loaded.runtime.telegramToken), today: context.today, clock: context.clock });
  return Response.json({ ok: true, ...result });
}
