import type { Sql } from "@/lib/db/client";
import { mapArea } from "@/lib/db/rows";
import type { AreaInput, AreaPatch } from "@/lib/domain/areas";
import { isUuid } from "@/lib/domain/dates";
import type { HouseArea } from "@/lib/domain/types";

const AREA_SELECT = `
  SELECT id, slug, name, kind, sort_order, notes, archived_at, created_by_agent, created_at, updated_at
  FROM house_areas
`;

export async function listAreas(sql: Sql, includeArchived: boolean): Promise<HouseArea[]> {
  const rows = await sql.query(
    `${AREA_SELECT} WHERE ($1::boolean OR archived_at IS NULL)
     ORDER BY CASE kind WHEN 'room' THEN 0 WHEN 'outdoor' THEN 1 ELSE 2 END, sort_order, name`,
    [includeArchived],
  );
  return rows.map((row) => mapArea(row));
}

/** Looks an area up by uuid or by slug. */
export async function getAreaByRef(sql: Sql, ref: string): Promise<HouseArea | null> {
  const column = isUuid(ref) ? "id::text" : "slug";
  const rows = await sql.query(`${AREA_SELECT} WHERE ${column} = $1`, [ref]);
  return rows[0] ? mapArea(rows[0]) : null;
}

export async function insertArea(sql: Sql, input: AreaInput): Promise<HouseArea> {
  const rows = await sql.query<{ id: string }>(
    `
      INSERT INTO house_areas (slug, name, kind, sort_order, notes, created_by_agent)
      VALUES ($1, $2, $3, $4, $5, true)
      RETURNING id
    `,
    [input.slug, input.name, input.kind, input.sort_order, input.notes],
  );
  const area = rows[0] ? await getAreaByRef(sql, rows[0].id) : null;
  if (!area) throw new Error("Inserted area could not be read back.");
  return area;
}

export async function updateArea(sql: Sql, id: string, patch: AreaPatch): Promise<HouseArea | null> {
  const params: unknown[] = [];
  const sets: string[] = [];
  const set = (fragment: string, value: unknown) => {
    params.push(value);
    sets.push(fragment.replace("$#", `$${params.length}`));
  };
  if (patch.name !== undefined) set("name = $#", patch.name);
  if (patch.kind !== undefined) set("kind = $#", patch.kind);
  if (patch.sort_order !== undefined) set("sort_order = $#", patch.sort_order);
  if (patch.notes !== undefined) set("notes = $#", patch.notes);
  if (patch.archived !== undefined) {
    set("archived_at = CASE WHEN $#::boolean THEN COALESCE(archived_at, now()) ELSE NULL END", patch.archived);
  }
  if (sets.length > 0) {
    params.push(id);
    await sql.query(`UPDATE house_areas SET ${sets.join(", ")} WHERE id::text = $${params.length}`, params);
  }
  return getAreaByRef(sql, id);
}
