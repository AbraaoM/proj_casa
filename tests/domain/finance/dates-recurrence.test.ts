import { describe, expect, test } from "vitest";
import { addMonths, dateOnDay, isMonth, monthRange, shiftMonth } from "@/lib/domain/finance/dates";
import { advanceBill, installmentDates, nextDueDate, splitInstallments } from "@/lib/domain/finance/recurrence";
import { applyDone } from "@/lib/domain/schedule";

describe("month helpers", () => {
  test("month range covers leap February", () => {
    expect(monthRange("2028-02")).toEqual({ from: "2028-02-01", to: "2028-02-29" });
    expect(monthRange("2026-02")).toEqual({ from: "2026-02-01", to: "2026-02-28" });
  });
  test("shiftMonth crosses years", () => {
    expect(shiftMonth("2026-01", -1)).toBe("2025-12");
    expect(shiftMonth("2026-11", 3)).toBe("2027-02");
  });
  test("isMonth", () => {
    expect(isMonth("2026-10")).toBe(true);
    expect(isMonth("2026-13")).toBe(false);
    expect(isMonth("2026-1")).toBe(false);
  });
  test("day 31 clamps per month and comes back", () => {
    expect(dateOnDay("2026-04", 31)).toBe("2026-04-30");
    expect(addMonths("2026-01-31", 1)).toBe("2026-02-28");
    expect(addMonths("2026-02-28", 1, 31)).toBe("2026-03-31");
  });
});

describe("bill recurrence", () => {
  test("monthly keeps the anchor day", () => {
    const rule = { frequency: "monthly" as const, interval: 1, day_of_month: 31 };
    expect(nextDueDate(rule, "2026-01-31")).toBe("2026-02-28");
    expect(nextDueDate(rule, "2026-02-28")).toBe("2026-03-31");
  });
  test("yearly on Feb 29 lands on Feb 28, then back to 29 in a leap year", () => {
    const rule = { frequency: "yearly" as const, interval: 1, day_of_month: 29 };
    expect(nextDueDate(rule, "2028-02-29")).toBe("2029-02-28");
    expect(nextDueDate({ ...rule, interval: 4 }, "2028-02-29")).toBe("2032-02-29");
  });
  test("weekly and every n days", () => {
    expect(nextDueDate({ frequency: "weekly", interval: 2, day_of_month: null }, "2026-10-16")).toBe("2026-10-30");
    expect(nextDueDate({ frequency: "every_n_days", interval: 10, day_of_month: null }, "2026-10-25")).toBe("2026-11-04");
  });
  test("remaining counts down and ends the bill", () => {
    const bill = { frequency: "monthly" as const, interval: 1, day_of_month: 10, next_due_date: "2026-10-10", end_date: null };
    expect(advanceBill({ ...bill, remaining: 2 })).toEqual({ next_due_date: "2026-11-10", remaining: 1, status: "active" });
    expect(advanceBill({ ...bill, remaining: 1 })).toEqual({ next_due_date: "2026-11-10", remaining: 0, status: "ended" });
    expect(advanceBill({ ...bill, remaining: null }).status).toBe("active");
  });
  test("end_date ends the bill once the next date passes it", () => {
    const bill = { frequency: "monthly" as const, interval: 1, day_of_month: 10, next_due_date: "2026-10-10", remaining: null };
    expect(advanceBill({ ...bill, end_date: "2026-11-10" }).status).toBe("active");
    expect(advanceBill({ ...bill, end_date: "2026-11-09" }).status).toBe("ended");
  });
});

describe("installments", () => {
  test("dates keep the purchase day", () => {
    expect(installmentDates("2026-01-31", 3)).toEqual(["2026-01-31", "2026-02-28", "2026-03-31"]);
  });
  test("split puts the leftover cents on the first part", () => {
    expect(splitInstallments(1000, 3)).toEqual([334, 333, 333]);
    expect(splitInstallments(1200, 3).reduce((a, b) => a + b, 0)).toBe(1200);
  });
});

describe("items with interval_months", () => {
  test("monthly schedule moves by calendar months", () => {
    const update = applyDone(
      { last_done_on: null, due_date: "2026-01-31", interval_days: null, interval_months: 3, status: "active" },
      "2026-01-31",
    );
    expect(update).toEqual({ advance: true, last_done_on: "2026-01-31", due_date: "2026-04-30", status: "active" });
  });
});
