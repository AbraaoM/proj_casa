import type { TelegramClient } from "@/lib/bot/telegram";
import type { Sql } from "@/lib/db/client";
import { claimReportChats } from "@/lib/repositories/bot";
import { loadDayReport } from "@/lib/services/day-report";
import { buildEveningReport } from "@/lib/ui/day";

/** Sends today's who-did-what report. At most one message per chat per day. */
export async function sendEveningReport(input: { sql: Sql; telegram: TelegramClient; today: string; timeZone: string }): Promise<{ sent: number; failed: number }> {
  const chats = await claimReportChats(input.sql, input.today);
  if (chats.length === 0) return { sent: 0, failed: 0 };
  const report = await loadDayReport(input.sql, { day: input.today, timeZone: input.timeZone });
  const text = buildEveningReport(report.people);
  let sent = 0;
  let failed = 0;
  for (const chatId of chats) {
    try {
      await input.telegram.call("sendMessage", { chat_id: chatId, text });
      sent += 1;
    } catch {
      failed += 1;
    }
  }
  return { sent, failed };
}
