import { describe, expect, test } from "vitest";
import { addDays, todayInTimeZone } from "@/lib/domain/dates";
import { outdoorDelay, weatherPhrase } from "@/lib/domain/weather";

describe("dates", () => {
  test("adds calendar days without drifting through UTC", () => {
    expect(addDays("2026-10-16", 10)).toBe("2026-10-26");
    expect(addDays("2024-01-01", 365)).toBe("2024-12-31");
  });

  test("reads the household day in America/Sao_Paulo", () => {
    expect(
      todayInTimeZone("America/Sao_Paulo", new Date("2026-10-16T02:30:00Z")),
    ).toBe("2026-10-15");
    expect(
      todayInTimeZone("America/Sao_Paulo", new Date("2026-10-16T03:00:00Z")),
    ).toBe("2026-10-16");
  });
});

describe("weather hints", () => {
  test("suggests delaying outdoor work at 60 percent chance of rain", () => {
    expect(outdoorDelay(59)).toBe(false);
    expect(outdoorDelay(60)).toBe(true);
    expect(outdoorDelay(null)).toBe(false);
  });

  test("names a rainy code as chuva", () => {
    expect(weatherPhrase(61)).toBe("chuva");
    expect(weatherPhrase(0)).toBe("céu limpo");
  });
});
