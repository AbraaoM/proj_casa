import { daysUntil } from "@/lib/domain/dates";
import {
  DEFAULT_WITHIN_DAYS,
  DOMAINS,
  type AttentionItem,
  type AttentionState,
  type AttentionSummary,
  type Domain,
  type ItemStatus,
  type Priority,
} from "@/lib/domain/types";

type AttentionSource = {
  status: ItemStatus;
  due_date: string | null;
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
): AttentionState | null {
  if (item.status !== "active") return null;
  if (!item.due_date) return "undated";
  const days = daysUntil(item.due_date, today);
  if (days < 0) return "overdue";
  if (days === 0) return "due_today";
  if (days <= withinDays) return "upcoming";
  return null;
}

export function sortAttention<
  T extends AttentionSource & { priority: Priority; due_date: string | null },
>(items: T[], today: string, withinDays = DEFAULT_WITHIN_DAYS): Array<T & Pick<AttentionItem, "attention" | "days_until_due">> {
  const visible = items.flatMap((item) => {
    const attention = attentionState(item, today, withinDays);
    if (!attention) return [];
    const days_until_due = item.due_date ? daysUntil(item.due_date, today) : null;
    return [{ ...item, attention, days_until_due }];
  });

  return visible.sort((left, right) => {
    const bucket = BUCKET_RANK[left.attention] - BUCKET_RANK[right.attention];
    if (bucket !== 0) return bucket;
    if (left.attention === "overdue" || left.attention === "upcoming") {
      const days = (left.days_until_due ?? 0) - (right.days_until_due ?? 0);
      if (days !== 0) return days;
    }
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

export function attentionPhrase(attention: AttentionState, daysUntilDue: number | null): string {
  if (attention === "due_today") return "vence hoje";
  if (attention === "undated" || daysUntilDue === null) return "sem data";
  if (attention === "overdue") {
    const days = Math.abs(daysUntilDue);
    return days === 1 ? "atrasada 1 dia" : `atrasada ${days} dias`;
  }
  return daysUntilDue === 1 ? "vence em 1 dia" : `vence em ${daysUntilDue} dias`;
}
