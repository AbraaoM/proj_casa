import { sendDailyDigest } from "@/lib/bot/digest";
import { runForEachBotFamily } from "@/lib/bot/jobs";
import { householdContext } from "@/lib/bot/runtime";
import { telegramClient } from "@/lib/bot/telegram";

export const maxDuration = 60;

/**
 * Daily summary, called by Vercel Cron (vercel.json, on Hobby once a day, ±59 min). It runs once for
 * every family that has its bot on, each with its own bot and its own data.
 * If CRON_SECRET is set in Vercel, its Authorization header is required. Without it the route
 * still sends at most one summary per chat per day, so a stray call cannot spam anyone.
 */
export async function GET(request: Request) {
  return runForEachBotFamily(request, async ({ sql, telegramToken }) => {
    const context = await householdContext(sql);
    return sendDailyDigest({ sql, telegram: telegramClient(telegramToken), today: context.today, clock: context.clock });
  });
}
