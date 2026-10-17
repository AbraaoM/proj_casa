import type { Sql } from "@/lib/db/client";
import { mapDog, mapFamilyMember, mapVehicle } from "@/lib/db/rows";
import type { DogInput, DogPatch, FamilyInput, FamilyPatch, VehicleInput, VehiclePatch } from "@/lib/domain/entities";
import type { Dog, FamilyMember, Vehicle } from "@/lib/domain/types";

export async function listDogs(sql: Sql, includeArchived: boolean): Promise<Dog[]> {
  const rows = await sql.query(
    `
      SELECT id, name, breed, sex, birth_date, weight_kg, notes, archived_at,
             created_by_agent, created_at, updated_at
      FROM dogs
      WHERE ($1::boolean OR archived_at IS NULL)
      ORDER BY name
    `,
    [includeArchived],
  );
  return rows.map((row) => mapDog(row));
}

export async function getDog(sql: Sql, id: string): Promise<Dog | null> {
  const rows = await sql.query(
    `
      SELECT id, name, breed, sex, birth_date, weight_kg, notes, archived_at,
             created_by_agent, created_at, updated_at
      FROM dogs WHERE id::text = $1
    `,
    [id],
  );
  const row = rows[0];
  return row ? mapDog(row) : null;
}

export async function insertDog(sql: Sql, input: DogInput): Promise<Dog> {
  const rows = await sql.query<{ id: string }>(
    `
      INSERT INTO dogs (name, breed, sex, birth_date, weight_kg, notes, created_by_agent)
      VALUES ($1, $2, $3, $4::date, $5, $6, true)
      RETURNING id
    `,
    [input.name, input.breed, input.sex, input.birth_date, input.weight_kg, input.notes],
  );
  const dog = rows[0] ? await getDog(sql, rows[0].id) : null;
  if (!dog) throw new Error("Inserted dog could not be read back.");
  return dog;
}

export async function updateDog(sql: Sql, id: string, patch: DogPatch): Promise<Dog | null> {
  const { sql: assignments, params } = buildAssignments([
    ["name", patch.name],
    ["breed", patch.breed],
    ["sex", patch.sex],
    ["birth_date", patch.birth_date, "date"],
    ["weight_kg", patch.weight_kg],
    ["notes", patch.notes],
  ]);
  const archive = archiveAssignment(patch.archived, params);
  const sets = [assignments, archive].filter(Boolean).join(", ");
  if (!sets) return getDog(sql, id);
  params.push(id);
  await sql.query(`UPDATE dogs SET ${sets} WHERE id::text = $${params.length}`, params);
  return getDog(sql, id);
}

export async function listFamily(sql: Sql, includeArchived: boolean): Promise<FamilyMember[]> {
  const rows = await sql.query(
    `
      SELECT id, name, relationship, birth_date, notes, archived_at,
             created_by_agent, created_at, updated_at
      FROM family_members
      WHERE ($1::boolean OR archived_at IS NULL)
      ORDER BY name
    `,
    [includeArchived],
  );
  return rows.map((row) => mapFamilyMember(row));
}

export async function getFamilyMember(sql: Sql, id: string): Promise<FamilyMember | null> {
  const rows = await sql.query(
    `
      SELECT id, name, relationship, birth_date, notes, archived_at,
             created_by_agent, created_at, updated_at
      FROM family_members WHERE id::text = $1
    `,
    [id],
  );
  const row = rows[0];
  return row ? mapFamilyMember(row) : null;
}

export async function insertFamily(sql: Sql, input: FamilyInput): Promise<FamilyMember> {
  const rows = await sql.query<{ id: string }>(
    `
      INSERT INTO family_members (name, relationship, birth_date, notes, created_by_agent)
      VALUES ($1, $2, $3::date, $4, true)
      RETURNING id
    `,
    [input.name, input.relationship, input.birth_date, input.notes],
  );
  const member = rows[0] ? await getFamilyMember(sql, rows[0].id) : null;
  if (!member) throw new Error("Inserted family member could not be read back.");
  return member;
}

export async function updateFamily(sql: Sql, id: string, patch: FamilyPatch): Promise<FamilyMember | null> {
  const { sql: assignments, params } = buildAssignments([
    ["name", patch.name],
    ["relationship", patch.relationship],
    ["birth_date", patch.birth_date, "date"],
    ["notes", patch.notes],
  ]);
  const archive = archiveAssignment(patch.archived, params);
  const sets = [assignments, archive].filter(Boolean).join(", ");
  if (!sets) return getFamilyMember(sql, id);
  params.push(id);
  await sql.query(`UPDATE family_members SET ${sets} WHERE id::text = $${params.length}`, params);
  return getFamilyMember(sql, id);
}

export async function listVehicles(sql: Sql, includeArchived: boolean): Promise<Vehicle[]> {
  const rows = await sql.query(
    `
      SELECT id, name, make, model, year, plate, odometer_km, notes, archived_at,
             created_by_agent, created_at, updated_at
      FROM vehicles
      WHERE ($1::boolean OR archived_at IS NULL)
      ORDER BY name
    `,
    [includeArchived],
  );
  return rows.map((row) => mapVehicle(row));
}

export async function getVehicle(sql: Sql, id: string): Promise<Vehicle | null> {
  const rows = await sql.query(
    `
      SELECT id, name, make, model, year, plate, odometer_km, notes, archived_at,
             created_by_agent, created_at, updated_at
      FROM vehicles WHERE id::text = $1
    `,
    [id],
  );
  const row = rows[0];
  return row ? mapVehicle(row) : null;
}

export async function insertVehicle(sql: Sql, input: VehicleInput): Promise<Vehicle> {
  const rows = await sql.query<{ id: string }>(
    `
      INSERT INTO vehicles (name, make, model, year, plate, odometer_km, notes, created_by_agent)
      VALUES ($1, $2, $3, $4, $5, $6, $7, true)
      RETURNING id
    `,
    [input.name, input.make, input.model, input.year, input.plate, input.odometer_km, input.notes],
  );
  const vehicle = rows[0] ? await getVehicle(sql, rows[0].id) : null;
  if (!vehicle) throw new Error("Inserted vehicle could not be read back.");
  return vehicle;
}

export async function updateVehicle(sql: Sql, id: string, patch: VehiclePatch): Promise<Vehicle | null> {
  const { sql: assignments, params } = buildAssignments([
    ["name", patch.name],
    ["make", patch.make],
    ["model", patch.model],
    ["year", patch.year],
    ["plate", patch.plate],
    ["odometer_km", patch.odometer_km],
    ["notes", patch.notes],
  ]);
  const archive = archiveAssignment(patch.archived, params);
  const sets = [assignments, archive].filter(Boolean).join(", ");
  if (!sets) return getVehicle(sql, id);
  params.push(id);
  await sql.query(`UPDATE vehicles SET ${sets} WHERE id::text = $${params.length}`, params);
  return getVehicle(sql, id);
}

type ColumnValue = [string, unknown, "date"?];

function buildAssignments(columns: ColumnValue[]): { sql: string; params: unknown[] } {
  const params: unknown[] = [];
  const sets: string[] = [];
  for (const [column, value, cast] of columns) {
    if (value === undefined) continue;
    params.push(value);
    const placeholder = `$${params.length}${cast === "date" ? "::date" : ""}`;
    sets.push(`${column} = ${placeholder}`);
  }
  return { sql: sets.join(", "), params };
}

function archiveAssignment(archived: boolean | undefined, params: unknown[]): string {
  if (archived === undefined) return "";
  params.push(archived);
  return `archived_at = CASE WHEN $${params.length}::boolean THEN COALESCE(archived_at, now()) ELSE NULL END`;
}
