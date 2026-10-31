import type { Sql } from "@/lib/db/client";
import { bool, integerOrNull, nullableText, text } from "@/lib/db/rows";
import type { DayDeedSource, DayKind } from "@/lib/domain/day-report";

type RawDeed = {
  id: unknown;
  kind: unknown;
  title: unknown;
  detail: unknown;
  amount_cents: unknown;
  by: unknown;
  via_agent: unknown;
  at: unknown;
};

function mapDeed(row: RawDeed, kind: DayKind): DayDeedSource & { via_agent: boolean; username: string | null } {
  return {
    id: text(row.id),
    kind,
    title: text(row.title),
    detail: nullableText(row.detail),
    amount_cents: integerOrNull(row.amount_cents),
    by: "",
    username: nullableText(row.by),
    via_agent: bool(row.via_agent),
    at: nullableText(row.at),
  };
}

/**
 * What was recorded on one calendar day.
 * A house routine (days or months, not hourly) is checklist. Any other live event is a task.
 * An expense that is not the cost of one of those events is a payment, so a task is not listed twice.
 */
export async function listDayRows(sql: Sql, input: { day: string; timeZone: string }): Promise<Array<DayDeedSource & { via_agent: boolean; username: string | null }>> {
  const events = await sql.query<RawDeed>(
    `SELECT e.id::text AS id,
            e.title,
            CASE
              WHEN i.domain = 'house' AND i.interval_hours IS NULL
                   AND (i.interval_days IS NOT NULL OR i.interval_months IS NOT NULL)
              THEN 'checklist' ELSE 'task'
            END AS kind,
            CASE
              WHEN i.domain = 'house' AND i.interval_hours IS NULL
                   AND (i.interval_days IS NOT NULL OR i.interval_months IS NOT NULL)
              THEN a.name
              ELSE COALESCE(
                (SELECT name FROM dogs WHERE id = COALESCE(e.dog_id, i.dog_id)),
                (SELECT name FROM family_members WHERE id = COALESCE(e.family_member_id, i.family_member_id)),
                (SELECT name FROM vehicles WHERE id = COALESCE(e.vehicle_id, i.vehicle_id)),
                a.name
              )
            END AS detail,
            e.amount_cents,
            u.username AS by,
            (e.agent_key_id IS NOT NULL) AS via_agent,
            CASE WHEN (COALESCE(e.done_at, e.created_at) AT TIME ZONE $2)::date = e.done_on
              THEN to_char(COALESCE(e.done_at, e.created_at) AT TIME ZONE $2, 'HH24:MI')
            END AS at
     FROM care_events e
     LEFT JOIN care_items i ON i.id = e.care_item_id
     LEFT JOIN users u ON u.id = e.created_by_user_id
     LEFT JOIN house_areas a ON a.id = COALESCE(e.area_id, i.area_id)
     WHERE e.voided_at IS NULL AND e.done_on = $1::date`,
    [input.day, input.timeZone],
  );
  const payments = await sql.query<RawDeed>(
    `SELECT t.id::text AS id,
            t.description AS title,
            'payment' AS kind,
            NULL AS detail,
            t.amount_cents,
            u.username AS by,
            (t.agent_key_id IS NOT NULL) AS via_agent,
            CASE WHEN (t.created_at AT TIME ZONE $2)::date = t.date
              THEN to_char(t.created_at AT TIME ZONE $2, 'HH24:MI')
            END AS at
     FROM fin_transactions t
     LEFT JOIN users u ON u.id = t.created_by_user_id
     WHERE t.voided_at IS NULL AND t.kind = 'expense' AND t.date = $1::date AND t.care_event_id IS NULL`,
    [input.day, input.timeZone],
  );
  return [
    ...events.map((row) => mapDeed(row, text(row.kind) === "checklist" ? "checklist" : "task")),
    ...payments.map((row) => mapDeed(row, "payment")),
  ];
}
