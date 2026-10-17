import { describe, expect, test } from "vitest";
import {
  groupByMonth,
  isNewestMeasurement,
  monthLabel,
  summarizeHistory,
  type HistoryEvent,
} from "@/lib/domain/history";

const TODAY = "2026-10-16";
let counter = 0;

function event(overrides: Partial<HistoryEvent>): HistoryEvent {
  counter += 1;
  return {
    id: `e${String(counter).padStart(3, "0")}`,
    category: "other",
    title: "Registro",
    done_on: "2026-10-01",
    weight_kg: null,
    odometer_km: null,
    amount_cents: null,
    voided_at: null,
    created_at: `2026-10-01T00:00:${String(counter % 60).padStart(2, "0")}.000Z`,
    ...overrides,
  };
}

describe("summarizeHistory", () => {
  test("keeps the newest event per category and counts days since", () => {
    const summary = summarizeHistory(
      [
        event({ category: "vaccine", title: "V10 2025", done_on: "2025-10-10" }),
        event({ category: "vaccine", title: "V10 2026", done_on: "2026-10-10" }),
        event({ category: "deworming", title: "Vermífugo", done_on: "2026-09-16" }),
      ],
      { today: TODAY },
    );
    expect(summary.events_count).toBe(3);
    expect(summary.last_done_on).toBe("2026-10-10");
    expect(summary.last_by_category.vaccine).toMatchObject({ title: "V10 2026", days_since: 6 });
    expect(summary.last_by_category.deworming).toMatchObject({ days_since: 30 });
  });

  test("ignores voided events everywhere", () => {
    const summary = summarizeHistory(
      [
        event({ category: "vet", done_on: "2026-10-15", amount_cents: 99999, weight_kg: 50, voided_at: "2026-10-15T10:00:00Z" }),
        event({ category: "vet", done_on: "2026-10-01", amount_cents: 15000, weight_kg: 12 }),
      ],
      { today: TODAY },
    );
    expect(summary.events_count).toBe(1);
    expect(summary.last_by_category.vet?.done_on).toBe("2026-10-01");
    expect(summary.costs.year_total_cents).toBe(15000);
    expect(summary.weight_series).toEqual([{ done_on: "2026-10-01", weight_kg: 12 }]);
  });

  test("builds the weight series oldest first", () => {
    const summary = summarizeHistory(
      [
        event({ done_on: "2026-08-01", weight_kg: 11 }),
        event({ done_on: "2026-10-01", weight_kg: 12.5 }),
        event({ done_on: "2026-09-01", weight_kg: 11.8 }),
        event({ done_on: "2026-09-15" }),
      ],
      { today: TODAY },
    );
    expect(summary.weight_series.map((point) => point.weight_kg)).toEqual([11, 11.8, 12.5]);
  });

  test("splits costs by this year and all time", () => {
    const summary = summarizeHistory(
      [
        event({ category: "oil", done_on: "2025-12-20", amount_cents: 30000 }),
        event({ category: "oil", done_on: "2026-06-20", amount_cents: 32000 }),
        event({ category: "tire", done_on: "2026-07-01", amount_cents: 80000 }),
      ],
      { today: TODAY },
    );
    expect(summary.costs).toEqual({
      year: 2026,
      year_total_cents: 112000,
      all_time_cents: 142000,
      year_by_category: { oil: 32000, tire: 80000 },
    });
  });

  test("computes km since the last oil change from the vehicle odometer", () => {
    const events = [
      event({ category: "oil", done_on: "2026-04-16", odometer_km: 40000 }),
      event({ category: "oil", done_on: "2025-10-16", odometer_km: 30000 }),
    ];
    expect(summarizeHistory(events, { today: TODAY, odometer_km: 45200 }).oil).toEqual({
      done_on: "2026-04-16",
      days_since: 183,
      odometer_km: 40000,
      km_since: 5200,
    });
    expect(summarizeHistory(events, { today: TODAY, odometer_km: null }).oil?.km_since).toBeNull();
    expect(summarizeHistory([], { today: TODAY }).oil).toBeNull();
  });
});

describe("groupByMonth", () => {
  test("groups newest month first and keeps newest first inside", () => {
    const groups = groupByMonth([
      event({ id: "a", done_on: "2026-09-03" }),
      event({ id: "b", done_on: "2026-10-01" }),
      event({ id: "c", done_on: "2026-09-28" }),
    ]);
    expect(groups.map((group) => group.key)).toEqual(["2026-10", "2026-09"]);
    expect(groups[1]?.events.map((item) => item.id)).toEqual(["c", "a"]);
    expect(groups[0]?.label).toBe("outubro de 2026");
  });

  test("labels months in Portuguese", () => {
    expect(monthLabel("2027-03")).toBe("março de 2027");
  });
});

describe("isNewestMeasurement", () => {
  test("newer or same day wins, older does not", () => {
    expect(isNewestMeasurement("2026-10-01", null)).toBe(true);
    expect(isNewestMeasurement("2026-10-01", "2026-10-01")).toBe(true);
    expect(isNewestMeasurement("2026-09-01", "2026-10-01")).toBe(false);
  });
});
