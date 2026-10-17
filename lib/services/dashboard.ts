import { tryGetSql, type Sql } from "@/lib/db/client";
import { isMissingSchema } from "@/lib/db/errors";
import { todayInTimeZone } from "@/lib/domain/dates";
import { DEFAULT_LOCATION, type AttentionItem, type AttentionSummary, type HouseholdSettings } from "@/lib/domain/types";
import { listAttention } from "@/lib/services/attention";
import { fallbackSettings, readSettings } from "@/lib/services/settings";
import { fetchWeather, type WeatherSnapshot } from "@/lib/weather/open-meteo";

export type DashboardData =
  | {
      status: "unconfigured";
      settings: HouseholdSettings;
      weather: WeatherSnapshot | null;
    }
  | {
      status: "schema_missing";
      settings: HouseholdSettings;
      weather: WeatherSnapshot | null;
    }
  | {
      status: "error";
      settings: HouseholdSettings;
      weather: WeatherSnapshot | null;
    }
  | {
      status: "ready";
      settings: HouseholdSettings;
      weather: WeatherSnapshot | null;
      today: string;
      items: AttentionItem[];
      summary: AttentionSummary;
    };

export async function loadDashboard(): Promise<DashboardData> {
  const sql = tryGetSql();
  if (!sql) {
    const settings = fallbackSettings();
    return { status: "unconfigured", settings, weather: await fetchWeather(settings) };
  }
  return loadFromDatabase(sql);
}

async function loadFromDatabase(sql: Sql): Promise<DashboardData> {
  const fallback = fallbackSettings();
  try {
    const settings = await readSettings(sql);
    const today = todayInTimeZone(settings.timezone);
    const [attention, weather] = await Promise.all([
      listAttention(sql, { today, withinDays: 14, domain: null }),
      fetchWeather(settings),
    ]);
    return { status: "ready", settings, weather, today, ...attention };
  } catch (error) {
    const weather = await fetchWeather(fallback);
    if (isMissingSchema(error)) {
      return { status: "schema_missing", settings: fallback, weather };
    }
    console.error(error);
    return { status: "error", settings: { ...fallback, ...DEFAULT_LOCATION }, weather };
  }
}
