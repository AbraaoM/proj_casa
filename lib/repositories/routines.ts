import type { Sql } from "@/lib/db/client";
import { mapItem } from "@/lib/db/rows";
import type { AreaKind, CareItem } from "@/lib/domain/types";

/** Who recorded an event: the person (username) and whether it came through an agent key. */
export type DoneBy = { by: string | null; via_agent: boolean };

export type RoutineRow = CareItem & {
  area_name: string | null;
  area_kind: AreaKind | null;
  area_sort: number | null;
  /** The newest live event: who, when (HH:mm when recorded the same day) and its note. */
  last: (DoneBy & { done_on: string; time: string | null; notes: string | null }) | null;
};

const ROUTINE_SQL = `
  SELECT
    i.id, i.domain, i.dog_id, i.family_member_id, i.vehicle_id,
    i.area_id, a.slug AS area_slug, a.name AS subject_name,
    a.name AS area_name, a.kind AS area_kind, a.sort_order AS area_sort,
    i.title, i.category, i.status, i.priority,
    i.due_date, i.last_done_on, i.interval_days, i.interval_months, i.notes,
    i.interval_hours, i.last_done_at, i.next_due_at, i.ends_on,
    i.created_by_agent, i.external_key, i.created_at, i.updated_at,
    le.done_on AS last_event_on, le.notes AS last_notes,
    CASE WHEN (le.created_at AT TIME ZONE $1)::date = le.done_on
      THEN to_char(le.created_at AT TIME ZONE $1, 'HH24:MI') END AS last_time,
    u.username AS last_by, (le.agent_key_id IS NOT NULL) AS last_via_agent
  FROM care_items i
  LEFT JOIN house_areas a ON a.id = i.area_id
  LEFT JOIN LATERAL (
    SELECT e.done_on, e.notes, e.created_at, e.created_by_user_id, e.agent_key_id
    FROM care_events e
    WHERE e.care_item_id = i.id AND e.voided_at IS NULL
    ORDER BY e.done_on DESC, e.created_at DESC
    LIMIT 1
  ) le ON true
  LEFT JOIN users u ON u.id = le.created_by_user_id
  WHERE i.domain = 'house'
    AND i.status = 'active'
    AND i.interval_hours IS NULL
    AND (i.interval_days IS NOT NULL OR i.interval_months IS NOT NULL)
    AND (a.id IS NULL OR a.archived_at IS NULL)
`;

function dateOnly(value: unknown): string {
  return value instanceof Date ? value.toISOString().slice(0, 10) : String(value).slice(0, 10);
}

/** Active house routines (repeat by days or months), optionally of one area (id or slug). */
export async function listRoutineRows(sql: Sql, input: { timeZone: string; area: string | null }): Promise<RoutineRow[]> {
  const params: unknown[] = [input.timeZone];
  let clause = "";
  if (input.area) {
    params.push(input.area);
    clause = " AND (a.id::text = $2 OR a.slug = $2)";
  }
  const rows = await sql.query(`${ROUTINE_SQL}${clause} ORDER BY a.sort_order NULLS LAST, a.name NULLS LAST, i.title`, params);
  return rows.map((row) => ({
    ...mapItem(row),
    area_name: (row.area_name as string | null) ?? null,
    area_kind: (row.area_kind as AreaKind | null) ?? null,
    area_sort: row.area_sort === null || row.area_sort === undefined ? null : Number(row.area_sort),
    last:
      row.last_event_on === null || row.last_event_on === undefined
        ? null
        : {
            done_on: dateOnly(row.last_event_on),
            time: (row.last_time as string | null) ?? null,
            notes: (row.last_notes as string | null) ?? null,
            by: (row.last_by as string | null) ?? null,
            via_agent: Boolean(row.last_via_agent),
          },
  }));
}

export type SheetEventRow = DoneBy & { care_item_id: string; done_on: string; time: string | null; notes: string | null };

/** Live events of the given items since a day, for the folha de registro. */
export async function listSheetEvents(sql: Sql, input: { itemIds: string[]; from: string; timeZone: string }): Promise<SheetEventRow[]> {
  if (input.itemIds.length === 0) return [];
  const rows = await sql.query(
    `SELECT e.care_item_id, e.done_on, e.notes, u.username AS by, (e.agent_key_id IS NOT NULL) AS via_agent,
       CASE WHEN (e.created_at AT TIME ZONE $3)::date = e.done_on
         THEN to_char(e.created_at AT TIME ZONE $3, 'HH24:MI') END AS time
     FROM care_events e
     LEFT JOIN users u ON u.id = e.created_by_user_id
     WHERE e.care_item_id = ANY($1::uuid[]) AND e.voided_at IS NULL AND e.done_on >= $2::date
     ORDER BY e.done_on, e.created_at`,
    [input.itemIds, input.from, input.timeZone],
  );
  return rows.map((row) => ({
    care_item_id: String(row.care_item_id),
    done_on: dateOnly(row.done_on),
    notes: (row.notes as string | null) ?? null,
    by: (row.by as string | null) ?? null,
    via_agent: Boolean(row.via_agent),
    time: (row.time as string | null) ?? null,
  }));
}
