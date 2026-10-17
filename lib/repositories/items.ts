import type { Sql } from "@/lib/db/client";
import { mapEvent, mapItem } from "@/lib/db/rows";
import { EVENT_SELECT, listItemEvents } from "@/lib/repositories/events";
import type { CreateItemInput, ItemListQuery } from "@/lib/domain/validate";
import type { CareEvent, CareItem, Domain } from "@/lib/domain/types";
import type { DoneWrite } from "@/lib/services/mark-done";

const ITEM_SQL = `
  SELECT
    i.id, i.domain, i.dog_id, i.family_member_id, i.vehicle_id,
    i.area_id, a.slug AS area_slug,
    i.title, i.category, i.status, i.priority,
    i.due_date, i.last_done_on, i.interval_days, i.notes,
    i.created_by_agent, i.external_key, i.created_at, i.updated_at,
    CASE i.domain
      WHEN 'dog' THEN d.name
      WHEN 'family' THEN f.name
      WHEN 'car' THEN v.name
      WHEN 'house' THEN a.name
      ELSE NULL
    END AS subject_name
  FROM care_items i
  LEFT JOIN dogs d ON d.id = i.dog_id
  LEFT JOIN family_members f ON f.id = i.family_member_id
  LEFT JOIN vehicles v ON v.id = i.vehicle_id
  LEFT JOIN house_areas a ON a.id = i.area_id
`;

export async function listItems(sql: Sql, query: ItemListQuery): Promise<CareItem[]> {
  const params: unknown[] = [];
  const where: string[] = [];
  const add = (column: string, value: unknown) => {
    params.push(value);
    where.push(`${column} = $${params.length}`);
  };
  if (query.domain) add("i.domain", query.domain);
  if (query.status) add("i.status", query.status);
  if (query.dog_id) add("i.dog_id::text", query.dog_id);
  if (query.family_member_id) add("i.family_member_id::text", query.family_member_id);
  if (query.vehicle_id) add("i.vehicle_id::text", query.vehicle_id);
  if (query.area) {
    params.push(query.area);
    where.push(`(i.area_id::text = $${params.length} OR a.slug = $${params.length})`);
  }
  params.push(query.limit);
  const clause = where.length > 0 ? `WHERE ${where.join(" AND ")}` : "";
  const rows = await sql.query(
    `${ITEM_SQL} ${clause} ORDER BY i.due_date NULLS LAST, i.title LIMIT $${params.length}`,
    params,
  );
  return rows.map((row) => mapItem(row));
}

export async function listActiveItems(sql: Sql, domain: Domain | null): Promise<CareItem[]> {
  return listItems(sql, {
    domain,
    status: "active",
    dog_id: null,
    family_member_id: null,
    vehicle_id: null,
    area: null,
    limit: 1000,
  });
}

export async function getItem(sql: Sql, id: string): Promise<CareItem | null> {
  const rows = await sql.query(`${ITEM_SQL} WHERE i.id::text = $1`, [id]);
  const row = rows[0];
  return row ? mapItem(row) : null;
}

export async function findItemByExternalKey(sql: Sql, externalKey: string): Promise<CareItem | null> {
  const rows = await sql.query(`${ITEM_SQL} WHERE i.external_key = $1`, [externalKey]);
  const row = rows[0];
  return row ? mapItem(row) : null;
}

export async function insertItem(sql: Sql, input: CreateItemInput): Promise<CareItem> {
  const rows = await sql.query<{ id: string }>(
    `
      INSERT INTO care_items (
        domain, dog_id, family_member_id, vehicle_id,
        title, category, status, priority,
        due_date, last_done_on, interval_days, notes,
        created_by_agent, external_key, area_id
      )
      VALUES (
        $1, $2::uuid, $3::uuid, $4::uuid,
        $5, $6, $7, $8,
        $9::date, $10::date, $11, $12,
        true, $13, $14::uuid
      )
      RETURNING id
    `,
    [
      input.domain,
      input.dog_id,
      input.family_member_id,
      input.vehicle_id,
      input.title,
      input.category,
      input.status,
      input.priority,
      input.due_date,
      input.last_done_on,
      input.interval_days,
      input.notes,
      input.external_key,
      input.area_id,
    ],
  );
  const id = rows[0]?.id;
  if (!id) throw new Error("Insert did not return an item id.");
  const item = await getItem(sql, id);
  if (!item) throw new Error("Inserted item could not be read back.");
  return item;
}

export async function updateItem(
  sql: Sql,
  id: string,
  patch: Partial<CreateItemInput>,
): Promise<CareItem | null> {
  const assignments: string[] = [];
  const params: unknown[] = [];
  const set = (sqlFragment: string, value: unknown) => {
    params.push(value);
    assignments.push(sqlFragment.replace("$#", `$${params.length}`));
  };

  if (patch.domain !== undefined) set("domain = $#", patch.domain);
  if (patch.dog_id !== undefined) set("dog_id = $#::uuid", patch.dog_id);
  if (patch.family_member_id !== undefined) set("family_member_id = $#::uuid", patch.family_member_id);
  if (patch.vehicle_id !== undefined) set("vehicle_id = $#::uuid", patch.vehicle_id);
  if (patch.area_id !== undefined) set("area_id = $#::uuid", patch.area_id);
  if (patch.title !== undefined) set("title = $#", patch.title);
  if (patch.category !== undefined) set("category = $#", patch.category);
  if (patch.status !== undefined) set("status = $#", patch.status);
  if (patch.priority !== undefined) set("priority = $#", patch.priority);
  if (patch.due_date !== undefined) set("due_date = $#::date", patch.due_date);
  if (patch.last_done_on !== undefined) set("last_done_on = $#::date", patch.last_done_on);
  if (patch.interval_days !== undefined) set("interval_days = $#", patch.interval_days);
  if (patch.notes !== undefined) set("notes = $#", patch.notes);

  if (assignments.length === 0) return getItem(sql, id);

  params.push(id);
  await sql.query(
    `UPDATE care_items SET ${assignments.join(", ")} WHERE id::text = $${params.length}`,
    params,
  );
  return getItem(sql, id);
}

export async function listEvents(sql: Sql, itemId: string): Promise<CareEvent[]> {
  return listItemEvents(sql, itemId, 20);
}

export { findEventByExternalKey } from "@/lib/repositories/events";

/**
 * Writes the done event (with the item's subject, category and title) and moves
 * the schedule in one statement. The dog's weight only changes when this is its
 * newest live weight. The odometer only goes up.
 */
export async function writeDone(sql: Sql, write: DoneWrite): Promise<{ item: CareItem; event: CareEvent }> {
  const rows = await sql.query<{ id: string }>(
    `
      WITH inserted AS (
        INSERT INTO care_events (
          care_item_id, domain, dog_id, family_member_id, vehicle_id, area_id,
          category, title, done_on, notes, provider,
          weight_kg, odometer_km, amount_cents, created_by_agent, external_key
        )
        SELECT i.id, i.domain, i.dog_id, i.family_member_id, i.vehicle_id, i.area_id,
               i.category, i.title, $2::date, $3, $14,
               $4, $5, $6, true, $7
        FROM care_items i
        WHERE i.id = $1::uuid
        RETURNING id
      ),
      updated AS (
        UPDATE care_items SET
          last_done_on = CASE WHEN $8::boolean THEN $9::date ELSE last_done_on END,
          due_date = CASE WHEN $8::boolean THEN $10::date ELSE due_date END,
          status = CASE WHEN $8::boolean THEN $11 ELSE status END
        WHERE id = $1::uuid
          AND EXISTS (SELECT 1 FROM inserted)
        RETURNING id
      ),
      dog_upd AS (
        UPDATE dogs SET weight_kg = $4
        WHERE $12::boolean
          AND id = (SELECT dog_id FROM care_items WHERE id = $1::uuid)
          AND NOT EXISTS (
            SELECT 1 FROM care_events ce
            WHERE ce.dog_id = dogs.id
              AND ce.weight_kg IS NOT NULL
              AND ce.voided_at IS NULL
              AND ce.done_on > $2::date
          )
        RETURNING id
      ),
      vehicle_upd AS (
        UPDATE vehicles SET odometer_km = $5
        WHERE $13::boolean
          AND id = (SELECT vehicle_id FROM care_items WHERE id = $1::uuid)
          AND (odometer_km IS NULL OR odometer_km < $5)
        RETURNING id
      )
      SELECT id FROM inserted
    `,
    [
      write.item_id,
      write.done_on,
      write.notes,
      write.weight_kg,
      write.odometer_km,
      write.amount_cents,
      write.external_key,
      write.advance,
      write.last_done_on,
      write.due_date,
      write.status,
      write.update_weight,
      write.update_odometer,
      write.provider,
    ],
  );
  const eventId = rows[0]?.id;
  if (!eventId) throw new Error("Marking done did not write an event.");
  const eventRows = await sql.query(`${EVENT_SELECT} WHERE e.id = $1::uuid`, [eventId]);
  const item = await getItem(sql, write.item_id);
  if (!item || !eventRows[0]) throw new Error("Item disappeared after it was marked done.");
  return { item, event: mapEvent(eventRows[0]) };
}
