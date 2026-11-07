import { describe, expect, test } from "vitest";
import {
  buildClose,
  canCloseMonth,
  closeOffer,
  countsTowardForecast,
  monthlyAmountCents,
  parseCloseBody,
  parseStoredClose,
} from "@/lib/domain/finance/close";

const mercado = { slug: "mercado", name: "Mercado", spent_cents: 80000, next_budget_cents: null as number | null, recurring_cents: 0 };

describe("month close", () => {
  test("only a finished month can be closed", () => {
    expect(canCloseMonth("2026-10", "2026-11-07")).toBe(true);
    expect(canCloseMonth("2026-11", "2026-11-07")).toBe(false);
    expect(canCloseMonth("2026-12", "2026-11-07")).toBe(false);
    expect(canCloseMonth("2026-13", "2026-11-07")).toBe(false);
  });

  test("the screen offers the month on it, or the previous one when that one is still open", () => {
    expect(closeOffer({ viewed: "2026-11", today: "2026-11-07", closed: [] })).toEqual({ month: "2026-10", kind: "close" });
    expect(closeOffer({ viewed: "2026-10", today: "2026-11-07", closed: [] })).toEqual({ month: "2026-10", kind: "close" });
    expect(closeOffer({ viewed: "2026-10", today: "2026-11-07", closed: ["2026-10"] })).toEqual({ month: "2026-10", kind: "pdf" });
    expect(closeOffer({ viewed: "2026-11", today: "2026-11-07", closed: ["2026-10"] })).toBeNull();
  });

  test("the budget wins, then the bills, then this month's spending", () => {
    const close = buildClose({
      month: "2026-10",
      income_cents: 500000,
      recurring_income_cents: 0,
      lines: [
        { ...mercado, next_budget_cents: 70000, recurring_cents: 60000 },
        { slug: "luz", name: "Luz", spent_cents: 20000, next_budget_cents: null, recurring_cents: 18000 },
        { slug: "lazer", name: "Lazer", spent_cents: 5000, next_budget_cents: null, recurring_cents: 0 },
        { slug: "vazio", name: "Vazio", spent_cents: 0, next_budget_cents: null, recurring_cents: 0 },
      ],
    });
    expect(close.next_month).toBe("2026-11");
    expect(close.lines.map((line) => [line.slug, line.forecast_cents, line.forecast_from])).toEqual([
      ["mercado", 70000, "budget"],
      ["luz", 18000, "bills"],
      ["lazer", 5000, "spent"],
    ]);
    expect(close.expense_cents).toBe(105000);
    expect(close.result_cents).toBe(395000);
    expect(close.forecast_expense_cents).toBe(93000);
    expect(close.forecast_income_cents).toBe(500000);
    expect(close.income_forecast_from).toBe("income");
  });

  test("income bills replace last month's income in the forecast", () => {
    const close = buildClose({ month: "2026-10", income_cents: 100, recurring_income_cents: 450000, lines: [] });
    expect(close.forecast_income_cents).toBe(450000);
    expect(close.income_forecast_from).toBe("bills");
  });

  test("a yearly bill is one twelfth, and a finished one does not count", () => {
    expect(monthlyAmountCents({ amount_cents: 120000, frequency: "yearly", interval: 1 })).toBe(10000);
    expect(monthlyAmountCents({ amount_cents: 30000, frequency: "monthly", interval: 1 })).toBe(30000);
    expect(countsTowardForecast({ status: "active", end_date: null, remaining: null }, "2026-11")).toBe(true);
    expect(countsTowardForecast({ status: "paused", end_date: null, remaining: null }, "2026-11")).toBe(false);
    expect(countsTowardForecast({ status: "active", end_date: "2026-10-31", remaining: null }, "2026-11")).toBe(false);
    expect(countsTowardForecast({ status: "active", end_date: null, remaining: 0 }, "2026-11")).toBe(false);
  });

  test("the request defaults to the month that just ended", () => {
    expect(parseCloseBody({}, "2026-11-07")).toEqual({ ok: true, value: { month: "2026-10", refresh: false } });
    expect(parseCloseBody({ month: "2026-09", refresh: true }, "2026-11-07")).toEqual({ ok: true, value: { month: "2026-09", refresh: true } });
    expect(parseCloseBody({ month: "outubro" }, "2026-11-07").ok).toBe(false);
    expect(parseCloseBody({ extra: true }, "2026-11-07").ok).toBe(false);
  });

  test("a broken snapshot is not a close", () => {
    expect(parseStoredClose(null)).toBeNull();
    expect(parseStoredClose({ month: "2026-10", closed_on: "2026-11-07" })).toBeNull();
    const close = parseStoredClose({
      month: "2026-10",
      closed_on: "2026-11-07",
      income_cents: 10,
      expense_cents: 4,
      forecast_income_cents: 10,
      forecast_expense_cents: 4,
      lines: [{ slug: "mercado", name: "Mercado", spent_cents: 4, forecast_cents: 4, forecast_from: "spent" }],
    });
    expect(close?.result_cents).toBe(6);
    expect(close?.lines).toHaveLength(1);
  });
});
