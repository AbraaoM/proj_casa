import { describe, expect, test } from "vitest";

describe("history order with times", () => {
  test("doses of the same day go newest time first; untimed events after them", async () => {
    const { compareNewestFirst } = await import("@/lib/domain/history");
    const base = { category: "medicine", title: "x", done_on: "2026-10-17", weight_kg: null, odometer_km: null, amount_cents: null, voided_at: null };
    const events = [
      { ...base, id: "a", done_at: "2026-10-17T04:30:00.000Z", created_at: "3" },
      { ...base, id: "b", done_at: "2026-10-17T12:15:00.000Z", created_at: "1" },
      { ...base, id: "c", done_at: null, created_at: "9" },
    ];
    expect([...events].sort(compareNewestFirst).map((event) => event.id)).toEqual(["b", "a", "c"]);
  });
});

describe("dose phrases", () => {
  test("time left, day words and intervals", async () => {
    const { dayWord, intervalPhrase, untilPhrase } = await import("@/lib/ui/doses");
    expect([untilPhrase(140), untilPhrase(40), untilPhrase(-20), untilPhrase(120), untilPhrase(0)]).toEqual([
      "em 2h20", "em 40 min", "há 20 min", "em 2 h", "agora",
    ]);
    expect([dayWord("2026-10-17", "2026-10-17"), dayWord("2026-10-16", "2026-10-17"), dayWord("2026-10-18", "2026-10-17"), dayWord("2026-10-10", "2026-10-17")]).toEqual([
      "hoje", "ontem", "amanhã", "10 out",
    ]);
    expect([intervalPhrase(6), intervalPhrase(24), intervalPhrase(48)]).toEqual(["a cada 6 h", "1x ao dia", "a cada 2 dias"]);
  });
});
