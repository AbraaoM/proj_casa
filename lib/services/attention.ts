import type { Sql } from "@/lib/db/client";
import { sortAttention, summarizeAttention } from "@/lib/domain/attention";
import type { AttentionItem, AttentionSummary, Clock, Domain } from "@/lib/domain/types";
import { listActiveItems } from "@/lib/repositories/items";

export async function listAttention(
  sql: Sql,
  input: { today: string; withinDays: number; domain: Domain | null; clock?: Clock | null },
): Promise<{ items: AttentionItem[]; summary: AttentionSummary }> {
  const active = await listActiveItems(sql, input.domain);
  const items = sortAttention(active, input.today, input.withinDays, input.clock ?? null);
  return { items, summary: summarizeAttention(items) };
}
