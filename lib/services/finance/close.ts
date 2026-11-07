import type { Sql } from "@/lib/db/client";
import { tryGetSql } from "@/lib/db/client";
import { isMissingSchema } from "@/lib/db/errors";
import { todayInTimeZone } from "@/lib/domain/dates";
import {
  buildClose,
  canCloseMonth,
  closeOffer,
  countsTowardForecast,
  monthlyAmountCents,
  type CloseOffer,
  type CloseSourceLine,
  type MonthClose,
} from "@/lib/domain/finance/close";
import { shiftMonth } from "@/lib/domain/finance/dates";
import type { FinCategory } from "@/lib/domain/finance/types";
import { validationError, notFound } from "@/lib/errors";
import * as repo from "@/lib/repositories/finance";
import { getMonthClose, listClosedMonths, saveMonthClose } from "@/lib/repositories/month-close";
import { getBudgetView } from "@/lib/services/finance/budgets";
import { getFinanceSummary } from "@/lib/services/finance/summary";
import { readSettings } from "@/lib/services/settings";

export type { CloseOffer, MonthClose };

function rootCategory(categoryId: string, byId: Map<string, FinCategory>): FinCategory | null {
  let current = byId.get(categoryId) ?? null;
  const seen = new Set<string>();
  while (current?.parent_id && !seen.has(current.id)) {
    seen.add(current.id);
    const parent = byId.get(current.parent_id);
    if (!parent) break;
    current = parent;
  }
  return current;
}

/** The numbers a close freezes. Reads the month as it is now. */
export async function assembleClose(sql: Sql, month: string): Promise<Omit<MonthClose, "closed_on">> {
  const next = shiftMonth(month, 1);
  const [summary, budget, categories, bills] = await Promise.all([
    getFinanceSummary(sql, month, `${month}-15`),
    getBudgetView(sql, next),
    repo.listCategories(sql, true),
    repo.listBills(sql, ["active"]),
  ]);
  const byId = new Map(categories.map((category) => [category.id, category]));
  const nameBySlug = new Map(categories.map((category) => [category.slug, category.name]));
  const recurring = new Map<string, number>();
  let recurringIncome = 0;
  for (const bill of bills) {
    if (!countsTowardForecast(bill, next)) continue;
    const amount = monthlyAmountCents(bill);
    if (bill.kind === "income") {
      recurringIncome += amount;
      continue;
    }
    const category = rootCategory(bill.category_id, byId);
    if (!category || category.kind !== "expense") continue;
    recurring.set(category.slug, (recurring.get(category.slug) ?? 0) + amount);
  }

  const spent = new Map(summary.expense_by_category.map((category) => [category.slug, category.amount_cents]));
  const budgets = new Map(
    budget.lines.filter((line) => line.parent_slug === null && line.budget_cents !== null).map((line) => [line.slug, line.budget_cents as number]),
  );
  const slugs = new Set<string>([...spent.keys(), ...budgets.keys(), ...recurring.keys()]);
  const lines: CloseSourceLine[] = [...slugs].map((slug) => ({
    slug,
    name: nameBySlug.get(slug) ?? summary.expense_by_category.find((category) => category.slug === slug)?.name ?? slug,
    spent_cents: spent.get(slug) ?? 0,
    next_budget_cents: budgets.has(slug) ? (budgets.get(slug) as number) : null,
    recurring_cents: recurring.get(slug) ?? 0,
  }));
  return buildClose({ month, income_cents: summary.income_cents, recurring_income_cents: recurringIncome, lines });
}

/** Closes a finished month. A second call returns the same snapshot, unless refresh is true. */
export async function closeMonth(sql: Sql, month: string, today: string, refresh = false): Promise<{ close: MonthClose; already: boolean }> {
  if (!canCloseMonth(month, today)) {
    throw validationError("Só dá para fechar um mês que já terminou.", [{ field: "month", message: "must be a finished month" }]);
  }
  const existing = await getMonthClose(sql, month);
  if (existing && !refresh) return { close: existing, already: true };
  const close: MonthClose = { ...(await assembleClose(sql, month)), closed_on: today };
  await saveMonthClose(sql, close);
  return { close, already: false };
}

export async function requireMonthClose(sql: Sql, month: string): Promise<MonthClose> {
  const close = await getMonthClose(sql, month);
  if (!close) throw notFound("Esse mês ainda não foi fechado.");
  return close;
}

/** The finance screen's one offer, or null when nothing is waiting and the month on screen is not closed. */
export async function loadCloseOffer(viewed: string): Promise<CloseOffer | null> {
  const sql = tryGetSql();
  if (!sql) return null;
  try {
    const today = todayInTimeZone((await readSettings(sql)).timezone);
    const candidates = [viewed, shiftMonth(viewed, -1)];
    const closed = await listClosedMonths(sql, candidates);
    const offer = closeOffer({ viewed, today, closed });
    if (!offer) return null;
    if (offer.kind === "close") return offer;
    const row = await getMonthClose(sql, offer.month);
    return row ? { month: offer.month, kind: "pdf", closed_on: row.closed_on } : { month: offer.month, kind: "close" };
  } catch (error) {
    if (!isMissingSchema(error)) console.error("month close failed");
    return null;
  }
}
