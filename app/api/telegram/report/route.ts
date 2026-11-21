import { runForEachBotFamily } from "@/lib/bot/jobs";
import { sendEveningReport } from "@/lib/bot/report";
import { householdContext } from "@/lib/bot/runtime";
import { telegramClient } from "@/lib/bot/telegram";

export const maxDuration = 60;

/**
 * End-of-day report, called by Vercel Cron. Runs once for every family that has its bot on.
 * If CRON_SECRET is set, its Authorization header is required. Without it the route
 * still sends at most one report per chat per day.
 */
export async function GET(request: Request) {
  return runForEachBotFamily(request, async ({ sql, telegramToken }) => {
    const context = await householdContext(sql);
    return sendEveningReport({ sql, telegram: telegramClient(telegramToken), today: context.today, timeZone: context.clock.timeZone });
  });
}
