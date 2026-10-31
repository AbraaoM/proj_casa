import { sendEveningReport } from "@/lib/bot/report";
import { householdContext, loadBotRuntime, sameSecret } from "@/lib/bot/runtime";
import { telegramClient } from "@/lib/bot/telegram";
import { tryGetSql } from "@/lib/db/client";

export const maxDuration = 60;

/**
 * End-of-day report, called by Vercel Cron (vercel.json, 22:00 America/Sao_Paulo).
 * On Hobby a daily cron can run up to 59 minutes late, still the same evening.
 * If CRON_SECRET is set, its Authorization header is required. Without it the route
 * still sends at most one report per chat per day.
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
  const result = await sendEveningReport({
    sql,
    telegram: telegramClient(loaded.runtime.telegramToken),
    today: context.today,
    timeZone: context.clock.timeZone,
  });
  return Response.json({ ok: true, ...result });
}
