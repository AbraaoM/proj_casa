import { attribution } from "@/lib/agent/actor";
import type { Sql } from "@/lib/db/client";
import { mapEvent } from "@/lib/db/rows";
import type { EventListQuery, EventPatch } from "@/lib/domain/events";
import type { CareEvent, Domain } from "@/lib/domain/types";

export const EVENT_SELECT = `
  SELECT
    e.id, e.care_item_id, e.domain, e.dog_id, e.family_member_id, e.vehicle_id,
    e.area_id, a.slug AS area_slug, e.category, e.title, e.done_on, e.done_at, e.notes, e.provider,
    e.weight_kg, e.odometer_km, e.amount_cents, e.voided_at,
    e.created_by_agent, e.external_key, e.created_at, e.updated_at,
    CASE e.domain
      WHEN 'dog' THEN d.name
      WHEN 'family' THEN f.name
      WHEN 'car' THEN v.name
      WHEN 'house' THEN a.name
      ELSE NULL
    END AS subject_name
  FROM care_events e
  LEFT JOIN dogs d ON d.id = e.dog_id
  LEFT JOIN family_members f ON f.id = e.family_member_id
  LEFT JOIN vehicles v ON v.id = e.vehicle_id
  LEFT JOIN house_areas a ON a.id = e.area_id
`;

const ORDER = "ORDER BY e.done_on DESC, e.done_at DESC NULLS LAST, e.created_at DESC, e.id DESC";

export type EventWrite = {
  care_item_id: string | null;
  domain: Domain;
  dog_id: string | null;
  family_member_id: string | null;
  vehicle_id: string | null;
  area_id: string | null;
  category: string;
  title: string;
  done_on: string;
  notes: string | null;
  provider: string | null;
  weight_kg: number | null;
  odometer_km: number | null;
  amount_cents: number | null;
  external_key: string | null;
};

export async function listEvents(sql: Sql, query: EventListQuery): Promise<CareEvent[]> {
  const params: unknown[] = [];
  const where: string[] = [];
  const add = (fragment: string, value: unknown) => {
    params.push(value);
    where.push(fragment.replaceAll("$#", `$${params.length}`));
  };
  if (query.domain) add("e.domain = $#", query.domain);
  if (query.dog_id) add("e.dog_id::text = $#", query.dog_id);
  if (query.family_member_id) add("e.family_member_id::text = $#", query.family_member_id);
  if (query.vehicle_id) add("e.vehicle_id::text = $#", query.vehicle_id);
  if (query.area) add("(e.area_id::text = $# OR a.slug = $#)", query.area);
  if (query.care_item_id) add("e.care_item_id::text = $#", query.care_item_id);
  if (query.category) add("e.category = $#", query.category);
  if (query.from) add("e.done_on >= $#::date", query.from);
  if (query.to) add("e.done_on <= $#::date", query.to);
  if (!query.include_voided) where.push("e.voided_at IS NULL");
  params.push(query.limit, query.offset);
  const clause = where.length > 0 ? `WHERE ${where.join(" AND ")}` : "";
  const rows = await sql.query(
    `${EVENT_SELECT} ${clause} ${ORDER} LIMIT $${params.length - 1} OFFSET $${params.length}`,
    params,
  );
  return rows.map((row) => mapEvent(row));
}

export async function getEvent(sql: Sql, id: string): Promise<CareEvent | null> {
  const rows = await sql.query(`${EVENT_SELECT} WHERE e.id::text = $1`, [id]);
  return rows[0] ? mapEvent(rows[0]) : null;
}

/**
 * The live event that owns an idempotency key. A voided event gives its key up
 * (renamed to "<key>~voided~<id>", kept for history), so repeating the same call
 * after an undo records something new instead of replaying what was undone.
 */
export async function findEventByExternalKey(sql: Sql, externalKey: string): Promise<CareEvent | null> {
  const rows = await sql.query(`${EVENT_SELECT} WHERE e.external_key = $1`, [externalKey]);
  const event = rows[0] ? mapEvent(rows[0]) : null;
  if (event && event.voided_at !== null) {
    await sql.query(`UPDATE care_events SET external_key = $2 WHERE id = $1::uuid AND external_key = $3`, [
      event.id,
      `${externalKey}~voided~${event.id}`,
      externalKey,
    ]);
    return null;
  }
  return event;
}

/** The item's newest live event other than `exceptId`. */
export async function latestLiveItemEvent(sql: Sql, itemId: string, exceptId: string): Promise<CareEvent | null> {
  const rows = await sql.query(
    `${EVENT_SELECT} WHERE e.care_item_id = $1::uuid AND e.voided_at IS NULL AND e.id <> $2::uuid ${ORDER} LIMIT 1`,
    [itemId, exceptId],
  );
  return rows[0] ? mapEvent(rows[0]) : null;
}

export async function listItemEvents(sql: Sql, itemId: string, limit = 20): Promise<CareEvent[]> {
  const rows = await sql.query(`${EVENT_SELECT} WHERE e.care_item_id::text = $1 ${ORDER} LIMIT $2`, [
    itemId,
    limit,
  ]);
  return rows.map((row) => mapEvent(row));
}

export async function insertEvent(sql: Sql, write: EventWrite): Promise<CareEvent> {
  const rows = await sql.query<{ id: string }>(
    `
      INSERT INTO care_events (
        care_item_id, domain, dog_id, family_member_id, vehicle_id, area_id,
        category, title, done_on, notes, provider,
        weight_kg, odometer_km, amount_cents, created_by_agent, external_key,
        created_by_user_id, agent_key_id
      )
      VALUES (
        $1::uuid, $2, $3::uuid, $4::uuid, $5::uuid, $6::uuid,
        $7, $8, $9::date, $10, $11,
        $12, $13, $14, true, $15,
        $16::uuid, $17::uuid
      )
      RETURNING id
    `,
    [
      write.care_item_id,
      write.domain,
      write.dog_id,
      write.family_member_id,
      write.vehicle_id,
      write.area_id,
      write.category,
      write.title,
      write.done_on,
      write.notes,
      write.provider,
      write.weight_kg,
      write.odometer_km,
      write.amount_cents,
      write.external_key,
      attribution().userId,
      attribution().keyId,
    ],
  );
  const event = rows[0] ? await getEvent(sql, rows[0].id) : null;
  if (!event) throw new Error("Inserted event could not be read back.");
  return event;
}

export async function updateEvent(sql: Sql, id: string, patch: EventPatch): Promise<CareEvent | null> {
  const params: unknown[] = [];
  const sets: string[] = [];
  const set = (fragment: string, value: unknown) => {
    params.push(value);
    sets.push(fragment.replace("$#", `$${params.length}`));
  };
  if (patch.done_on !== undefined) set("done_on = $#::date", patch.done_on);
  if (patch.title !== undefined) set("title = $#", patch.title);
  if (patch.category !== undefined) set("category = $#", patch.category);
  if (patch.notes !== undefined) set("notes = $#", patch.notes);
  if (patch.provider !== undefined) set("provider = $#", patch.provider);
  if (patch.weight_kg !== undefined) set("weight_kg = $#", patch.weight_kg);
  if (patch.odometer_km !== undefined) set("odometer_km = $#", patch.odometer_km);
  if (patch.amount_cents !== undefined) set("amount_cents = $#", patch.amount_cents);
  if (patch.voided !== undefined) {
    set("voided_at = CASE WHEN $#::boolean THEN COALESCE(voided_at, now()) ELSE NULL END", patch.voided);
  }
  if (sets.length === 0) return getEvent(sql, id);
  params.push(id);
  await sql.query(`UPDATE care_events SET ${sets.join(", ")} WHERE id::text = $${params.length}`, params);
  return getEvent(sql, id);
}

/** Newest live weight day for a dog, ignoring one event (the one being written). */
export async function newestWeightDate(sql: Sql, dogId: string, exceptEventId: string | null = null): Promise<string | null> {
  const rows = await sql.query<{ done_on: unknown }>(
    `
      SELECT max(done_on)::text AS done_on FROM care_events
      WHERE dog_id = $1::uuid AND weight_kg IS NOT NULL AND voided_at IS NULL
        AND ($2::uuid IS NULL OR id <> $2::uuid)
    `,
    [dogId, exceptEventId],
  );
  const value = rows[0]?.done_on;
  return value === null || value === undefined ? null : String(value).slice(0, 10);
}

export async function setDogWeight(sql: Sql, dogId: string, weightKg: number): Promise<void> {
  await sql.query("UPDATE dogs SET weight_kg = $2 WHERE id = $1::uuid", [dogId, weightKg]);
}

/**
 * After a correction, the dog's weight follows its newest live weight event.
 * With no weight events left, the current value stays (it may have been set by PATCH /dogs).
 */
export async function refreshDogWeight(sql: Sql, dogId: string): Promise<void> {
  await sql.query(
    `
      UPDATE dogs SET weight_kg = latest.weight_kg
      FROM (
        SELECT weight_kg FROM care_events
        WHERE dog_id = $1::uuid AND weight_kg IS NOT NULL AND voided_at IS NULL
        ORDER BY done_on DESC, created_at DESC
        LIMIT 1
      ) latest
      WHERE dogs.id = $1::uuid
    `,
    [dogId],
  );
}

/** The odometer only goes up. */
export async function bumpOdometer(sql: Sql, vehicleId: string, km: number): Promise<void> {
  await sql.query(
    "UPDATE vehicles SET odometer_km = $2 WHERE id = $1::uuid AND (odometer_km IS NULL OR odometer_km < $2)",
    [vehicleId, km],
  );
}
