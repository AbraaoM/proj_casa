import type { Sql } from "@/lib/db/client";
import { instant, mapEvent } from "@/lib/db/rows";
import type { DoseSchedule } from "@/lib/domain/doses";
import type { CareEvent } from "@/lib/domain/types";
import { EVENT_SELECT, getEvent } from "@/lib/repositories/events";

const DOSE_ORDER = "ORDER BY e.done_at DESC, e.created_at DESC, e.id DESC";

export type DoseWrite = {
  item_id: string;
  done_at: string;
  done_on: string;
  notes: string | null;
  external_key: string | null;
};

/** A dose is an event tied to the item, carrying the item's subject, category and title. */
export async function insertDose(sql: Sql, write: DoseWrite): Promise<CareEvent> {
  const rows = await sql.query<{ id: string }>(
    `
      INSERT INTO care_events (
        care_item_id, domain, dog_id, family_member_id, vehicle_id, area_id,
        category, title, done_on, done_at, notes, created_by_agent, external_key
      )
      SELECT i.id, i.domain, i.dog_id, i.family_member_id, i.vehicle_id, i.area_id,
             i.category, i.title, $2::date, $3::timestamptz, $4, true, $5
      FROM care_items i
      WHERE i.id = $1::uuid
      RETURNING id
    `,
    [write.item_id, write.done_on, write.done_at, write.notes, write.external_key],
  );
  const event = rows[0] ? await getEvent(sql, rows[0].id) : null;
  if (!event) throw new Error("Inserted dose could not be read back.");
  return event;
}

/** The live dose of an item at the same minute, if any (dedupe without a key). */
export async function findDoseAtMinute(sql: Sql, itemId: string, doneAt: string): Promise<CareEvent | null> {
  const rows = await sql.query(
    `${EVENT_SELECT}
     WHERE e.care_item_id = $1::uuid AND e.voided_at IS NULL
       AND date_trunc('minute', e.done_at) = date_trunc('minute', $2::timestamptz)
     ${DOSE_ORDER} LIMIT 1`,
    [itemId, doneAt],
  );
  return rows[0] ? mapEvent(rows[0]) : null;
}

/** Times of the item's live doses. */
export async function liveDoseTimes(sql: Sql, itemId: string): Promise<string[]> {
  const rows = await sql.query<{ done_at: unknown }>(
    `SELECT done_at FROM care_events
     WHERE care_item_id = $1::uuid AND done_at IS NOT NULL AND voided_at IS NULL`,
    [itemId],
  );
  return rows.flatMap((row) => {
    const time = instant(row.done_at);
    return time ? [time] : [];
  });
}

/** Doses of some items, newest first. */
export async function listDoses(
  sql: Sql,
  input: { item_ids: string[]; from: string | null; to: string | null; include_voided: boolean; limit: number },
): Promise<CareEvent[]> {
  if (input.item_ids.length === 0) return [];
  const rows = await sql.query(
    `${EVENT_SELECT}
     WHERE e.care_item_id = ANY($1::uuid[]) AND e.done_at IS NOT NULL
       AND ($2::timestamptz IS NULL OR e.done_at >= $2::timestamptz)
       AND ($3::timestamptz IS NULL OR e.done_at <= $3::timestamptz)
       AND ($4::boolean OR e.voided_at IS NULL)
     ${DOSE_ORDER} LIMIT $5`,
    [input.item_ids, input.from, input.to, input.include_voided, input.limit],
  );
  return rows.map((row) => mapEvent(row));
}

export async function writeDoseSchedule(sql: Sql, itemId: string, schedule: DoseSchedule): Promise<void> {
  await sql.query(
    `UPDATE care_items SET
       last_done_at = $2::timestamptz,
       next_due_at = $3::timestamptz,
       due_date = $4::date,
       status = $5,
       last_done_on = CASE WHEN $2::timestamptz IS NULL THEN last_done_on ELSE $6::date END
     WHERE id = $1::uuid`,
    [itemId, schedule.last_done_at, schedule.next_due_at, schedule.due_date, schedule.status, schedule.last_done_on],
  );
}
