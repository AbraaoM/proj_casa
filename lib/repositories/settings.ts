import type { Sql } from "@/lib/db/client";
import { mapSettings } from "@/lib/db/rows";
import type { SettingsPatch } from "@/lib/domain/entities";
import type { HouseholdSettings } from "@/lib/domain/types";

const SELECT_SETTINGS = `
  SELECT city, region, country, latitude, longitude, timezone, updated_at
  FROM household_settings
  WHERE id = 1
`;

export async function getSettings(sql: Sql): Promise<HouseholdSettings | null> {
  const rows = await sql.query(SELECT_SETTINGS);
  const row = rows[0];
  return row ? mapSettings(row) : null;
}

export async function getSchemaVersion(sql: Sql): Promise<string | null> {
  const rows = await sql.query<{ version: string }>(
    "SELECT version FROM schema_migrations ORDER BY version DESC LIMIT 1",
  );
  return rows[0]?.version ?? null;
}

export async function updateSettings(sql: Sql, patch: SettingsPatch): Promise<HouseholdSettings | null> {
  const params: unknown[] = [];
  const sets: string[] = [];
  const set = (column: string, value: unknown) => {
    params.push(value);
    sets.push(`${column} = $${params.length}`);
  };
  if (patch.city !== undefined) set("city", patch.city);
  if (patch.region !== undefined) set("region", patch.region);
  if (patch.country !== undefined) set("country", patch.country);
  if (patch.latitude !== undefined) set("latitude", patch.latitude);
  if (patch.longitude !== undefined) set("longitude", patch.longitude);
  if (patch.timezone !== undefined) set("timezone", patch.timezone);
  if (sets.length === 0) return getSettings(sql);
  await sql.query(`UPDATE household_settings SET ${sets.join(", ")} WHERE id = 1`, params);
  return getSettings(sql);
}
