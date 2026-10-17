import type { Sql } from "@/lib/db/client";
import type { SettingsPatch } from "@/lib/domain/entities";
import { DEFAULT_LOCATION, DEFAULT_TIMEZONE, type HouseholdSettings } from "@/lib/domain/types";
import { notFound } from "@/lib/errors";
import { getSettings, updateSettings } from "@/lib/repositories/settings";

export async function readSettings(sql: Sql): Promise<HouseholdSettings> {
  const settings = await getSettings(sql);
  if (!settings) throw notFound("Household settings were not found.");
  return settings;
}

export async function patchSettings(sql: Sql, patch: SettingsPatch): Promise<HouseholdSettings> {
  const settings = await updateSettings(sql, patch);
  if (!settings) throw notFound("Household settings were not found.");
  return settings;
}

export function fallbackSettings(): HouseholdSettings {
  return {
    ...DEFAULT_LOCATION,
    timezone: DEFAULT_TIMEZONE,
    updated_at: "",
  };
}
