import type { AttentionItem } from "@/lib/domain/types";
import type { InlineButton, TelegramClient } from "@/lib/bot/telegram";
import type { Sql } from "@/lib/db/client";
import { listAttention } from "@/lib/services/attention";
import { claimDigestChats, purgeOldBotData } from "@/lib/repositories/bot";
import type { Clock } from "@/lib/domain/types";
import type { RoutineState } from "@/lib/domain/routine";
import { listRoutines } from "@/lib/services/routines";
import { readSettings } from "@/lib/services/settings";
import { sinceLabel, statusPhrase } from "@/lib/ui/routine";

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

/** A house routine as the digest needs it (see lib/services/routines). */
export type DigestRoutine = { id: string; title: string; area_name: string | null; state: RoutineState };

/** Routines that ask for a tap today: late, never recorded, or due today. */
export function routinesForToday<T extends DigestRoutine>(routines: T[]): T[] {
  return routines.filter((routine) => routine.state.status === "overdue" || routine.state.status === "never" || routine.state.days_until_due <= 0);
}

export function routineLine(routine: DigestRoutine): string {
  const area = routine.area_name ? ` (${routine.area_name})` : "";
  const since = routine.state.days_since === null ? "" : `, última vez ${sinceLabel(routine.state.days_since)}`;
  return `• ${routine.title}${area}: ${statusPhrase(routine.state)}${since}`;
}

export function buildDigest(items: AttentionItem[], routines: DigestRoutine[] = []): { text: string; buttons: InlineButton[][] } {
  const house = routinesForToday(routines);
  // Routines shown in the house section leave the generic ones (no line twice).
  const known = new Set(house.map((routine) => routine.id));
  const generic = items.filter((item) => !known.has(item.id));
  const overdue = generic.filter((item) => item.attention === "overdue");
  const today = generic.filter((item) => item.attention === "due_today");
  const soon = generic.filter((item) => item.attention === "upcoming");
  if (overdue.length + today.length + soon.length + house.length === 0) {
    return { text: "Bom dia! Nada pedindo atenção na Casa hoje.", buttons: [] };
  }
  const parts = ["Bom dia! Hoje na Casa:"];
  let budget = DIGEST_MAX_LINES;
  const section = <T,>(title: string, list: T[], render: (entry: T) => string) => {
    if (list.length === 0 || budget <= 0) return;
    const shown = list.slice(0, budget);
    budget -= shown.length;
    parts.push("", title, ...shown.map(render));
    if (list.length > shown.length) parts.push(`• e mais ${list.length - shown.length}`);
  };
  section("Atrasado", overdue, line);
  section("Hoje", today, line);
  section("Limpeza e rotina da casa", house, routineLine);
  section(`Próximos ${DIGEST_WITHIN_DAYS} dias`, soon, line);
  parts.push("", "Toque em Feito ou me conte o que foi feito.");
  const tappable = [
    ...overdue.filter((item) => !item.interval_hours),
    ...today.filter((item) => !item.interval_hours),
    ...house,
  ].slice(0, DIGEST_MAX_BUTTONS);
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
  const settings = await readSettings(input.sql);
  const routines = await listRoutines(input.sql, { area: null, status: null, limit: null, today: input.today, timeZone: settings.timezone });
  const digest = buildDigest(attention.items.filter((item) => item.attention !== "undated"), routines);
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
