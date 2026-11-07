import { isMonth, shiftMonth } from "@/lib/domain/finance/dates";
import type { BillFrequency } from "@/lib/domain/finance/types";
import type { FieldError } from "@/lib/errors";

export type ForecastFrom = "budget" | "bills" | "spent";

export type CloseSourceLine = {
  slug: string;
  name: string;
  spent_cents: number;
  /** Budget already set for the next month. null when nobody set one. */
  next_budget_cents: number | null;
  /** Monthly cost of the active bills in this category. */
  recurring_cents: number;
};

export type CloseLine = {
  slug: string;
  name: string;
  spent_cents: number;
  forecast_cents: number;
  forecast_from: ForecastFrom;
};

export type MonthClose = {
  month: string;
  next_month: string;
  closed_on: string;
  income_cents: number;
  expense_cents: number;
  result_cents: number;
  forecast_income_cents: number;
  forecast_expense_cents: number;
  /** "bills" when active income bills exist; otherwise this month's income is repeated. */
  income_forecast_from: "bills" | "income";
  lines: CloseLine[];
};

export type CloseOffer =
  | { month: string; kind: "close" }
  | { month: string; kind: "pdf"; closed_on: string };

/** A month can be closed only after it has ended. November closes October, never itself. */
export function canCloseMonth(month: string, today: string): boolean {
  return isMonth(month) && month < today.slice(0, 7);
}

/** What the finance screen should offer. The month on screen wins; otherwise the previous one, if it is still open. */
export function closeOffer(input: { viewed: string; today: string; closed: readonly string[] }): { month: string; kind: "close" } | { month: string; kind: "pdf" } | null {
  if (canCloseMonth(input.viewed, input.today)) {
    return { month: input.viewed, kind: input.closed.includes(input.viewed) ? "pdf" : "close" };
  }
  const previous = shiftMonth(input.viewed, -1);
  if (canCloseMonth(previous, input.today) && !input.closed.includes(previous)) return { month: previous, kind: "close" };
  return null;
}

/**
 * Next month's number for one category.
 * The budget they set wins. Without one, the bills that repeat. Without those, this month's spending.
 */
export function forecastLine(line: CloseSourceLine): CloseLine {
  const base = { slug: line.slug, name: line.name, spent_cents: line.spent_cents };
  if (line.next_budget_cents !== null) return { ...base, forecast_cents: line.next_budget_cents, forecast_from: "budget" };
  if (line.recurring_cents > 0) return { ...base, forecast_cents: line.recurring_cents, forecast_from: "bills" };
  return { ...base, forecast_cents: line.spent_cents, forecast_from: "spent" };
}

/** Yearly and weekly bills become a monthly amount, in whole cents. */
export function monthlyAmountCents(bill: { amount_cents: number; frequency: BillFrequency; interval: number }): number {
  const interval = bill.interval > 0 ? bill.interval : 1;
  if (bill.frequency === "monthly") return Math.round(bill.amount_cents / interval);
  if (bill.frequency === "yearly") return Math.round(bill.amount_cents / (12 * interval));
  if (bill.frequency === "weekly") return Math.round((bill.amount_cents * 52) / (12 * interval));
  return Math.round((bill.amount_cents * 30) / interval);
}

/** A paused, finished or already-ended bill is not part of next month. */
export function countsTowardForecast(
  bill: { status: string; end_date: string | null; remaining: number | null },
  nextMonth: string,
): boolean {
  if (bill.status !== "active") return false;
  if (bill.remaining !== null && bill.remaining <= 0) return false;
  if (bill.end_date && bill.end_date < `${nextMonth}-01`) return false;
  return true;
}

export function buildClose(input: {
  month: string;
  income_cents: number;
  recurring_income_cents: number;
  lines: CloseSourceLine[];
}): Omit<MonthClose, "closed_on"> {
  const lines = input.lines
    .map(forecastLine)
    .filter((line) => line.spent_cents !== 0 || line.forecast_cents !== 0)
    .sort((a, b) => b.spent_cents - a.spent_cents || a.name.localeCompare(b.name, "pt-BR"));
  const expense = lines.reduce((sum, line) => sum + line.spent_cents, 0);
  const incomeFromBills = input.recurring_income_cents > 0;
  return {
    month: input.month,
    next_month: shiftMonth(input.month, 1),
    income_cents: input.income_cents,
    expense_cents: expense,
    result_cents: input.income_cents - expense,
    forecast_income_cents: incomeFromBills ? input.recurring_income_cents : input.income_cents,
    forecast_expense_cents: lines.reduce((sum, line) => sum + line.forecast_cents, 0),
    income_forecast_from: incomeFromBills ? "bills" : "income",
    lines,
  };
}

type ParseResult<T> = { ok: true; value: T } | { ok: false; details: FieldError[] };

/** month defaults to the month that just ended. refresh true rebuilds a close that already exists. */
export function parseCloseBody(body: unknown, today: string): ParseResult<{ month: string; refresh: boolean }> {
  const record = body === undefined || body === null ? {} : body;
  if (typeof record !== "object" || Array.isArray(record)) return { ok: false, details: [{ field: "body", message: "must be an object" }] };
  const fields = record as Record<string, unknown>;
  const extra = Object.keys(fields).filter((key) => key !== "month" && key !== "refresh");
  if (extra.length > 0) return { ok: false, details: extra.map((field) => ({ field, message: "is not a known field" })) };
  const month = fields.month === undefined ? shiftMonth(today.slice(0, 7), -1) : fields.month;
  if (typeof month !== "string" || !isMonth(month)) return { ok: false, details: [{ field: "month", message: "must be YYYY-MM" }] };
  const refresh = fields.refresh === undefined ? false : fields.refresh;
  if (typeof refresh !== "boolean") return { ok: false, details: [{ field: "refresh", message: "must be true or false" }] };
  return { ok: true, value: { month, refresh } };
}

function numberField(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? Math.round(value) : null;
}

/** A snapshot written by an older or broken row is ignored, not shown as a close. */
export function parseStoredClose(value: unknown): MonthClose | null {
  if (typeof value !== "object" || value === null) return null;
  const row = value as Record<string, unknown>;
  if (typeof row.month !== "string" || !isMonth(row.month)) return null;
  if (typeof row.closed_on !== "string") return null;
  const income = numberField(row.income_cents);
  const expense = numberField(row.expense_cents);
  const forecastIncome = numberField(row.forecast_income_cents);
  const forecastExpense = numberField(row.forecast_expense_cents);
  if (income === null || expense === null || forecastIncome === null || forecastExpense === null) return null;
  if (!Array.isArray(row.lines)) return null;
  const lines: CloseLine[] = [];
  for (const raw of row.lines) {
    if (typeof raw !== "object" || raw === null) return null;
    const line = raw as Record<string, unknown>;
    const spent = numberField(line.spent_cents);
    const forecast = numberField(line.forecast_cents);
    if (typeof line.slug !== "string" || typeof line.name !== "string" || spent === null || forecast === null) return null;
    if (line.forecast_from !== "budget" && line.forecast_from !== "bills" && line.forecast_from !== "spent") return null;
    lines.push({ slug: line.slug, name: line.name, spent_cents: spent, forecast_cents: forecast, forecast_from: line.forecast_from });
  }
  return {
    month: row.month,
    next_month: typeof row.next_month === "string" ? row.next_month : shiftMonth(row.month, 1),
    closed_on: row.closed_on,
    income_cents: income,
    expense_cents: expense,
    result_cents: numberField(row.result_cents) ?? income - expense,
    forecast_income_cents: forecastIncome,
    forecast_expense_cents: forecastExpense,
    income_forecast_from: row.income_forecast_from === "bills" ? "bills" : "income",
    lines,
  };
}
