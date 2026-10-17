import { describe, expect, test } from "vitest";
import { applyDone } from "@/lib/domain/schedule";

describe("applyDone", () => {
  test("rolls a recurring item forward and keeps it active", () => {
    expect(
      applyDone(
        {
          last_done_on: null,
          due_date: "2026-10-16",
          interval_days: 10,
          status: "active",
        },
        "2026-10-16",
      ),
    ).toEqual({
      advance: true,
      last_done_on: "2026-10-16",
      due_date: "2026-10-26",
      status: "active",
    });
  });

  test("completes a one-off item and leaves its due date in place", () => {
    expect(
      applyDone(
        {
          last_done_on: null,
          due_date: "2026-10-20",
          interval_days: null,
          status: "active",
        },
        "2026-10-18",
      ),
    ).toEqual({
      advance: true,
      last_done_on: "2026-10-18",
      due_date: "2026-10-20",
      status: "completed",
    });
  });

  test("records an older event without moving the schedule backward", () => {
    expect(
      applyDone(
        {
          last_done_on: "2026-10-10",
          due_date: "2026-11-10",
          interval_days: 30,
          status: "active",
        },
        "2026-09-01",
      ),
    ).toEqual({
      advance: false,
      last_done_on: "2026-10-10",
      due_date: "2026-11-10",
      status: "active",
    });
  });

  test("treats the same day as the latest occurrence", () => {
    const result = applyDone(
      {
        last_done_on: "2026-10-16",
        due_date: "2026-10-16",
        interval_days: 7,
        status: "active",
      },
      "2026-10-16",
    );
    expect(result.advance).toBe(true);
    expect(result.due_date).toBe("2026-10-23");
  });

  test("reactivates a paused recurring item when the latest care is logged", () => {
    expect(
      applyDone(
        {
          last_done_on: null,
          due_date: "2026-10-01",
          interval_days: 30,
          status: "paused",
        },
        "2026-10-16",
      ).status,
    ).toBe("active");
  });
});
