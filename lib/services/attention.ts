import { tryGetSql, type Sql } from "@/lib/db/client";
import { isMissingSchema } from "@/lib/db/errors";
import { pressingCount, sortAttention, summarizeAttention } from "@/lib/domain/attention";
import { todayInTimeZone } from "@/lib/domain/dates";
import type { AttentionItem, AttentionSummary, Clock, Domain } from "@/lib/domain/types";
import { listActiveItems } from "@/lib/repositories/items";
import { clockFor, readSettings } from "@/lib/services/settings";

export async function listAttention(
  sql: Sql,
  input: { today: string; withinDays: number; domain: Domain | null; clock?: Clock | null },
): Promise<{ items: AttentionItem[]; summary: AttentionSummary }> {
  const active = await listActiveItems(sql, input.domain);
  const items = sortAttention(active, input.today, input.withinDays, input.clock ?? null);
  return { items, summary: summarizeAttention(items) };
}

/** Late items plus what is due today, for the icon on the phone. Null when it cannot be read. */
export async function readPressingCount(): Promise<number | null> {
  const sql = tryGetSql();
  if (!sql) return null;
  try {
    const settings = await readSettings(sql);
    const today = todayInTimeZone(settings.timezone);
    const { summary } = await listAttention(sql, { today, withinDays: 0, domain: null, clock: clockFor(settings) });
    return pressingCount(summary);
  } catch (error) {
    if (!isMissingSchema(error)) console.error("badge count failed");
    return null;
  }
}
