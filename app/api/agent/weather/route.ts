import { jsonOk, run } from "@/lib/agent/http";
import { tryGetSql } from "@/lib/db/client";
import { isMissingSchema } from "@/lib/db/errors";
import { fallbackSettings, readSettings } from "@/lib/services/settings";
import { fetchWeather } from "@/lib/weather/open-meteo";

export async function GET(request: Request) {
  return run(request, async () => {
    let settings = fallbackSettings();
    const sql = tryGetSql();
    if (sql) {
      try {
        settings = await readSettings(sql);
      } catch (error) {
        if (!isMissingSchema(error)) throw error;
      }
    }

    const weather = await fetchWeather(settings);
    return jsonOk({
      location: {
        city: settings.city,
        region: settings.region,
        latitude: settings.latitude,
        longitude: settings.longitude,
        timezone: settings.timezone,
      },
      weather,
      unavailable: weather === null,
    });
  });
}
