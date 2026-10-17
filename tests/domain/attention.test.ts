import { describe, expect, test } from "vitest";
import {
  attentionState,
  sortAttention,
  summarizeAttention,
} from "@/lib/domain/attention";
import type { Domain, ItemStatus, Priority } from "@/lib/domain/types";

const TODAY = "2026-10-16";

function item(overrides: {
  id: string;
  status?: ItemStatus;
  priority?: Priority;
  due_date?: string | null;
  domain?: Domain;
}) {
  return {
    id: overrides.id,
    status: overrides.status ?? "active",
    priority: overrides.priority ?? "normal",
    due_date: overrides.due_date === undefined ? null : overrides.due_date,
    domain: overrides.domain ?? "house",
  };
}

describe("attentionState", () => {
  test("marks a past due date as overdue", () => {
    expect(
      attentionState(item({ id: "a", due_date: "2026-10-01" }), TODAY, 14),
    ).toBe("overdue");
  });

  test("marks today as due_today", () => {
    expect(
      attentionState(item({ id: "a", due_date: TODAY }), TODAY, 14),
    ).toBe("due_today");
  });

  test("marks a date inside the window as upcoming", () => {
    expect(
      attentionState(item({ id: "a", due_date: "2026-10-30" }), TODAY, 14),
    ).toBe("upcoming");
  });

  test("drops a date outside the window", () => {
    expect(
      attentionState(item({ id: "a", due_date: "2026-10-31" }), TODAY, 14),
    ).toBeNull();
  });

  test("keeps an active item without a date", () => {
    expect(attentionState(item({ id: "a" }), TODAY, 14)).toBe("undated");
  });

  test("drops paused, completed, and cancelled items", () => {
    for (const status of ["paused", "completed", "cancelled"] as const) {
      expect(
        attentionState(
          item({ id: status, status, due_date: "2026-10-01" }),
          TODAY,
          14,
        ),
      ).toBeNull();
    }
  });

  test("with a zero-day window, only overdue, today, and undated remain", () => {
    expect(
      attentionState(item({ id: "soon", due_date: "2026-10-17" }), TODAY, 0),
    ).toBeNull();
    expect(
      attentionState(item({ id: "today", due_date: TODAY }), TODAY, 0),
    ).toBe("due_today");
  });
});

describe("sortAttention", () => {
  test("orders overdue first, then today, then upcoming, then undated", () => {
    const sorted = sortAttention(
      [
        item({ id: "undated-low", priority: "low" }),
        item({ id: "far", due_date: "2026-12-01" }),
        item({ id: "paused", status: "paused", due_date: "2026-10-01" }),
        item({ id: "done", status: "completed", due_date: "2026-10-01" }),
        item({ id: "in-5", due_date: "2026-10-21", priority: "urgent" }),
        item({ id: "in-1", due_date: "2026-10-17", priority: "low" }),
        item({ id: "today-normal", due_date: TODAY, priority: "normal" }),
        item({ id: "today-high", due_date: TODAY, priority: "high" }),
        item({ id: "overdue-2-urgent", due_date: "2026-10-14", priority: "urgent" }),
        item({ id: "overdue-10-normal", due_date: "2026-10-06", priority: "normal" }),
        item({ id: "overdue-10-urgent", due_date: "2026-10-06", priority: "urgent" }),
        item({ id: "undated-urgent", priority: "urgent" }),
      ],
      TODAY,
      14,
    );

    expect(sorted.map((entry) => entry.id)).toEqual([
      "overdue-10-urgent",
      "overdue-10-normal",
      "overdue-2-urgent",
      "today-high",
      "today-normal",
      "in-1",
      "in-5",
      "undated-urgent",
      "undated-low",
    ]);
    expect(sorted[0]).toMatchObject({
      attention: "overdue",
      days_until_due: -10,
    });
    expect(sorted.find((entry) => entry.id === "in-1")).toMatchObject({
      attention: "upcoming",
      days_until_due: 1,
    });
    expect(sorted.find((entry) => entry.id === "undated-low")).toMatchObject({
      attention: "undated",
      days_until_due: null,
    });
  });
});

describe("summarizeAttention", () => {
  test("counts each attention state per domain", () => {
    const summary = summarizeAttention([
      { domain: "dog", attention: "overdue" },
      { domain: "dog", attention: "due_today" },
      { domain: "finance", attention: "upcoming" },
      { domain: "house", attention: "undated" },
    ]);

    expect(summary.overdue).toBe(1);
    expect(summary.due_today).toBe(1);
    expect(summary.upcoming).toBe(1);
    expect(summary.undated).toBe(1);
    expect(summary.by_domain.dog).toEqual({
      overdue: 1,
      due_soon: 1,
      total_active: 2,
    });
    expect(summary.by_domain.finance).toEqual({
      overdue: 0,
      due_soon: 1,
      total_active: 1,
    });
    expect(summary.by_domain.car).toEqual({
      overdue: 0,
      due_soon: 0,
      total_active: 0,
    });
  });
});
