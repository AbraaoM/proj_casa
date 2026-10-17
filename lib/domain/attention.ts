import { daysUntil } from "@/lib/domain/dates";
import { isDoseLate, localTime } from "@/lib/domain/doses";
import {
  DEFAULT_WITHIN_DAYS,
  DOMAINS,
  type AttentionItem,
  type AttentionState,
  type AttentionSummary,
  type Clock,
  type Domain,
  type ItemStatus,
  type Priority,
} from "@/lib/domain/types";

type AttentionSource = {
  status: ItemStatus;
  due_date: string | null;
  /** Hourly items: late as soon as this time passes. */
  next_due_at?: string | null;
};

const PRIORITY_RANK: Record<Priority, number> = {
  urgent: 0,
  high: 1,
  normal: 2,
  low: 3,
};

const BUCKET_RANK: Record<AttentionState, number> = {
  overdue: 0,
  due_today: 1,
  upcoming: 2,
  undated: 3,
};

export function attentionState(
  item: AttentionSource,
  today: string,
  withinDays = DEFAULT_WITHIN_DAYS,
  clock: Clock | null = null,
): AttentionState | null {
  if (item.status !== "active") return null;
  if (clock && item.next_due_at && isDoseLate(item.next_due_at, clock.now)) return "overdue";
  if (!item.due_date) return "undated";
  const days = daysUntil(item.due_date, today);
  if (days < 0) return "overdue";
  if (days === 0) return "due_today";
  if (days <= withinDays) return "upcoming";
  return null;
}

export function sortAttention<
  T extends AttentionSource & { priority: Priority; due_date: string | null },
>(
  items: T[],
  today: string,
  withinDays = DEFAULT_WITHIN_DAYS,
  clock: Clock | null = null,
): Array<T & Pick<AttentionItem, "attention" | "days_until_due" | "next_due_time">> {
  const visible = items.flatMap((item) => {
    const attention = attentionState(item, today, withinDays, clock);
    if (!attention) return [];
    const days_until_due = item.due_date ? daysUntil(item.due_date, today) : null;
    return [{ ...item, attention, days_until_due, next_due_time: nextDueTime(item, clock) }];
  });

  return visible.sort((left, right) => {
    const bucket = BUCKET_RANK[left.attention] - BUCKET_RANK[right.attention];
    if (bucket !== 0) return bucket;
    if (left.attention === "overdue" || left.attention === "upcoming") {
      const days = (left.days_until_due ?? 0) - (right.days_until_due ?? 0);
      if (days !== 0) return days;
    }
    const time = compareDueTimes(left.next_due_at ?? null, right.next_due_at ?? null);
    if (time !== 0) return time;
    return PRIORITY_RANK[left.priority] - PRIORITY_RANK[right.priority];
  });
}

export function summarizeAttention(
  items: Array<{ domain: Domain; attention: AttentionState }>,
): AttentionSummary {
  const by_domain = Object.fromEntries(
    DOMAINS.map((domain) => [domain, { overdue: 0, due_soon: 0, total_active: 0 }]),
  ) as AttentionSummary["by_domain"];

  const summary: AttentionSummary = {
    overdue: 0,
    due_today: 0,
    upcoming: 0,
    undated: 0,
    by_domain,
  };

  for (const item of items) {
    summary[item.attention] += 1;
    const counts = by_domain[item.domain];
    counts.total_active += 1;
    if (item.attention === "overdue") counts.overdue += 1;
    if (item.attention === "due_today" || item.attention === "upcoming") counts.due_soon += 1;
  }

  return summary;
}

/** "HH:mm" of the next dose in the household time zone, or null. */
export function nextDueTime(item: { next_due_at?: string | null }, clock: Clock | null): string | null {
  return clock && item.next_due_at ? localTime(item.next_due_at, clock.timeZone) : null;
}

/** Earlier dose first; items without a time keep their order. */
export function compareDueTimes(left: string | null, right: string | null): number {
  if (!left || !right) return 0;
  return Date.parse(left) - Date.parse(right);
}

export function attentionPhrase(
  attention: AttentionState,
  daysUntilDue: number | null,
  nextDueTime: string | null = null,
): string {
  if (nextDueTime) {
    if (attention === "overdue") return `dose atrasada · era ${nextDueTime}`;
    if (attention === "due_today") return `próxima dose ${nextDueTime}`;
    if (daysUntilDue === 1) return `próxima dose amanhã ${nextDueTime}`;
  }
  if (attention === "due_today") return "vence hoje";
  if (attention === "undated" || daysUntilDue === null) return "sem data";
  if (attention === "overdue") {
    const days = Math.abs(daysUntilDue);
    return days === 1 ? "atrasada 1 dia" : `atrasada ${days} dias`;
  }
  return daysUntilDue === 1 ? "vence em 1 dia" : `vence em ${daysUntilDue} dias`;
}
