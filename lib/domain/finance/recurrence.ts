import { addDays } from "@/lib/domain/dates";
import { addMonths } from "@/lib/domain/finance/dates";
import type { BillFrequency, BillStatus } from "@/lib/domain/finance/types";

export type Recurrence = {
  frequency: BillFrequency;
  interval: number;
  day_of_month: number | null;
};

/** The due date after `due`. Monthly and yearly bills keep their day (31 clamps per month). */
export function nextDueDate(rule: Recurrence, due: string): string {
  switch (rule.frequency) {
    case "monthly":
      return addMonths(due, rule.interval, rule.day_of_month ?? undefined);
    case "yearly":
      return addMonths(due, 12 * rule.interval, rule.day_of_month ?? undefined);
    case "weekly":
      return addDays(due, 7 * rule.interval);
    case "every_n_days":
      return addDays(due, rule.interval);
  }
}

/** The due date before `due`: the inverse of nextDueDate, for undoing a payment. */
export function previousDueDate(rule: Recurrence, due: string): string {
  switch (rule.frequency) {
    case "monthly":
      return addMonths(due, -rule.interval, rule.day_of_month ?? undefined);
    case "yearly":
      return addMonths(due, -12 * rule.interval, rule.day_of_month ?? undefined);
    case "weekly":
      return addDays(due, -7 * rule.interval);
    case "every_n_days":
      return addDays(due, -rule.interval);
  }
}

export type BillAfterPayment = {
  next_due_date: string;
  remaining: number | null;
  status: BillStatus;
};

/**
 * Paying the current due date moves the bill forward. With `remaining` (installments)
 * the bill ends after the last one; with `end_date` it ends once the next date passes it.
 */
export function advanceBill(
  bill: Recurrence & { next_due_date: string; remaining: number | null; end_date: string | null },
): BillAfterPayment {
  const next = nextDueDate(bill, bill.next_due_date);
  const remaining = bill.remaining === null ? null : Math.max(0, bill.remaining - 1);
  const ended = remaining === 0 || (bill.end_date !== null && next > bill.end_date);
  return { next_due_date: next, remaining, status: ended ? "ended" : "active" };
}

/**
 * Undoing the latest payment: the bill goes back to the due date that payment
 * settled, gets its installment back, and an ended bill is active again.
 */
export function retreatBill(
  bill: Recurrence & { next_due_date: string; remaining: number | null; status: BillStatus },
): BillAfterPayment {
  return {
    next_due_date: previousDueDate(bill, bill.next_due_date),
    remaining: bill.remaining === null ? null : bill.remaining + 1,
    status: bill.status === "ended" ? "active" : bill.status,
  };
}

/** Dates of N monthly installments, starting on the purchase date and keeping its day. */
export function installmentDates(first: string, count: number): string[] {
  const day = Number(first.slice(8, 10));
  return Array.from({ length: count }, (_, index) => addMonths(first, index, day));
}

/** Splits a total in N parts; the cents that do not divide go to the first installment. */
export function splitInstallments(totalCents: number, count: number): number[] {
  const base = Math.floor(totalCents / count);
  const rest = totalCents - base * count;
  return Array.from({ length: count }, (_, index) => (index === 0 ? base + rest : base));
}
