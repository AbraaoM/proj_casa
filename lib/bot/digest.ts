import type { AttentionItem } from "@/lib/domain/types";
import type { InlineButton, TelegramClient } from "@/lib/bot/telegram";
import type { Sql } from "@/lib/db/client";
import { listAttention } from "@/lib/services/attention";
import { claimDigestChats, purgeOldBotData } from "@/lib/repositories/bot";
import type { Clock } from "@/lib/domain/types";

/** The daily summary: plain text from the attention list (no AI call, no token cost). */
export const DIGEST_WITHIN_DAYS = 3;
export const DIGEST_MAX_LINES = 12;
export const DIGEST_MAX_BUTTONS = 5;

function day(iso: string | null): string {
  return iso ? `${iso.slice(8, 10)}/${iso.slice(5, 7)}` : "";
}

function line(item: AttentionItem): string {
  const subject = item.subject_name ? ` (${item.subject_name})` : "";
  if (item.attention === "overdue") return `• ${item.title}${subject}, venceu ${day(item.due_date)}`;
  if (item.attention === "upcoming") return `• ${item.title}${subject}, ${day(item.due_date)}`;
  return `• ${item.title}${subject}`;
}

export function buildDigest(items: AttentionItem[]): { text: string; buttons: InlineButton[][] } {
  const overdue = items.filter((item) => item.attention === "overdue");
  const today = items.filter((item) => item.attention === "due_today");
  const soon = items.filter((item) => item.attention === "upcoming");
  if (overdue.length + today.length + soon.length === 0) {
    return { text: "Bom dia! Nada pedindo atenção na Casa hoje.", buttons: [] };
  }
  const parts = ["Bom dia! Hoje na Casa:"];
  let budget = DIGEST_MAX_LINES;
  const section = (title: string, list: AttentionItem[]) => {
    if (list.length === 0 || budget <= 0) return;
    const shown = list.slice(0, budget);
    budget -= shown.length;
    parts.push("", title, ...shown.map(line));
    if (list.length > shown.length) parts.push(`• e mais ${list.length - shown.length}`);
  };
  section("Atrasado", overdue);
  section("Hoje", today);
  section(`Próximos ${DIGEST_WITHIN_DAYS} dias`, soon);
  parts.push("", "Toque em Feito ou me conte o que foi feito.");
  const tappable = [...overdue, ...today].filter((item) => !item.interval_hours).slice(0, DIGEST_MAX_BUTTONS);
  return {
    text: parts.join("\n"),
    buttons: tappable.map((item) => [{ text: `Feito: ${item.title}`.slice(0, 60), callback_data: `done:${item.id}` }]),
  };
}

export async function sendDailyDigest(input: { sql: Sql; telegram: TelegramClient; today: string; clock: Clock }): Promise<{ sent: number; failed: number }> {
  await purgeOldBotData(input.sql);
  const chats = await claimDigestChats(input.sql, input.today);
  if (chats.length === 0) return { sent: 0, failed: 0 };
  const attention = await listAttention(input.sql, { today: input.today, withinDays: DIGEST_WITHIN_DAYS, domain: null, clock: input.clock });
  const digest = buildDigest(attention.items.filter((item) => item.attention !== "undated"));
  let sent = 0;
  let failed = 0;
  for (const chatId of chats) {
    try {
      await input.telegram.call("sendMessage", {
        chat_id: chatId,
        text: digest.text,
        ...(digest.buttons.length > 0 ? { reply_markup: { inline_keyboard: digest.buttons } } : {}),
      });
      sent += 1;
    } catch {
      failed += 1;
    }
  }
  return { sent, failed };
}
