import { outdoorDelay, weatherPhrase } from "@/lib/domain/weather";

export type WeatherSnapshot = {
  temperature_c: number;
  weather_code: number;
  phrase: string;
  precipitation_probability: number | null;
  outdoor_delay: boolean;
};

type ForecastLocation = {
  latitude: number;
  longitude: number;
  timezone: string;
};

export async function fetchWeather(location: ForecastLocation): Promise<WeatherSnapshot | null> {
  const url = new URL("https://api.open-meteo.com/v1/forecast");
  url.searchParams.set("latitude", String(location.latitude));
  url.searchParams.set("longitude", String(location.longitude));
  url.searchParams.set("current", "temperature_2m,weather_code");
  url.searchParams.set("daily", "precipitation_probability_max");
  url.searchParams.set("timezone", location.timezone);
  url.searchParams.set("forecast_days", "3");

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 4000);
  try {
    const response = await fetch(url, {
      signal: controller.signal,
      next: { revalidate: 1800 },
    });
    if (!response.ok) return null;
    const body = (await response.json()) as {
      current?: { temperature_2m?: number; weather_code?: number };
      daily?: { precipitation_probability_max?: Array<number | null> };
    };
    const temperature = body.current?.temperature_2m;
    const code = body.current?.weather_code;
    if (typeof temperature !== "number" || typeof code !== "number") return null;
    const probability = body.daily?.precipitation_probability_max?.[0] ?? null;
    return {
      temperature_c: Math.round(temperature),
      weather_code: code,
      phrase: weatherPhrase(code),
      precipitation_probability: typeof probability === "number" ? probability : null,
      outdoor_delay: outdoorDelay(typeof probability === "number" ? probability : null),
    };
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}
