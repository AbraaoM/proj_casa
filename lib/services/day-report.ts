import type { Sql } from "@/lib/db/client";
import { dayCounts, groupDay, type DayReport } from "@/lib/domain/day-report";
import { listDayRows } from "@/lib/repositories/day-report";
import { doneByLabel } from "@/lib/services/routines";
import { presentDeed } from "@/lib/ui/day";

/** Who did what on a calendar day, read live from events and payments. Nothing is snapshotted. */
export async function loadDayReport(sql: Sql, input: { day: string; timeZone: string }): Promise<DayReport> {
  const rows = await listDayRows(sql, input);
  const deeds = rows.map((row) => presentDeed({ ...row, by: doneByLabel({ by: row.username, via_agent: row.via_agent }) }));
  return { date: input.day, counts: dayCounts(deeds), people: groupDay(deeds) };
}
