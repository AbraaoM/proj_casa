import { addDays } from "@/lib/domain/dates";
import { dateOnDay, monthOf, shiftMonth } from "@/lib/domain/finance/dates";
import { LIABILITY_KINDS, type AccountKind, type AccountTotals } from "@/lib/domain/finance/types";

export function isLiability(kind: AccountKind): boolean {
  return LIABILITY_KINDS.includes(kind);
}

/**
 * Balance from the opening balance and the account's totals.
 * Assets: income and transfers in add, expenses and transfers out subtract.
 * Liabilities (card, loan) hold what is owed: purchases add, payments (transfers in) and refunds subtract.
 */
export function accountBalance(kind: AccountKind, openingCents: number, totals: AccountTotals): number {
  const flow = totals.income_cents - totals.expense_cents + totals.transfer_in_cents - totals.transfer_out_cents;
  return isLiability(kind) ? openingCents - flow : openingCents + flow;
}

export type NetWorth = { assets_cents: number; liabilities_cents: number; net_cents: number };

export function netWorth(accounts: Array<{ kind: AccountKind; balance_cents: number }>): NetWorth {
  let assets = 0;
  let liabilities = 0;
  for (const account of accounts) {
    if (isLiability(account.kind)) liabilities += account.balance_cents;
    else assets += account.balance_cents;
  }
  return { assets_cents: assets, liabilities_cents: liabilities, net_cents: assets - liabilities };
}

export type CardCycle = { from: string; to: string; due_date: string | null };

/**
 * The open credit card statement that contains `today`. It closes on `closeDay`
 * (clamped per month) and is due on `dueDay` of the month after closing, or of the
 * same month when the due day comes after the closing day.
 */
export function cardCycle(today: string, closeDay: number, dueDay: number | null): CardCycle {
  const month = monthOf(today);
  const closeThisMonth = dateOnDay(month, closeDay);
  const to = today <= closeThisMonth ? closeThisMonth : dateOnDay(shiftMonth(month, 1), closeDay);
  const from = addDays(dateOnDay(shiftMonth(monthOf(to), -1), closeDay), 1);
  let due: string | null = null;
  if (dueDay !== null) {
    due = dueDay > closeDay ? dateOnDay(monthOf(to), dueDay) : dateOnDay(shiftMonth(monthOf(to), 1), dueDay);
  }
  return { from, to, due_date: due };
}
