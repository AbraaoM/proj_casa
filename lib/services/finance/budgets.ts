import type { Sql } from "@/lib/db/client";
import { budgetLines, effectiveBudgets, type BudgetLine } from "@/lib/domain/finance/budget";
import { monthRange, shiftMonth } from "@/lib/domain/finance/dates";
import type { FinCategory } from "@/lib/domain/finance/types";
import type { BudgetPut } from "@/lib/domain/finance/validate";
import { validationError } from "@/lib/errors";
import * as repo from "@/lib/repositories/finance";
import { requireCategoryField } from "@/lib/services/finance/refs";

export type BudgetView = {
  month: string;
  lines: BudgetLine[];
  total_budget_cents: number;
  total_spent_cents: number;
  over: string[];
  /** Last 6 months (oldest first) of spending per top-level category, children included. */
  trend: { months: string[]; by_category: Record<string, number[]> };
};

/** Expense minus refunds per category id in a date range. */
export async function spendingByCategory(sql: Sql, from: string, to: string, categories: FinCategory[]) {
  return spendFrom(await repo.categoryFlows(sql, from, to), categories);
}

function spendFrom(flows: Awaited<ReturnType<typeof repo.categoryFlows>>, categories: FinCategory[]) {
  const kinds = new Map(categories.map((category) => [category.id, category.kind]));
  const spent = new Map<string, number>();
  for (const flow of flows) {
    if (kinds.get(flow.category_id) !== "expense") continue;
    const signed = flow.kind === "expense" ? flow.amount_cents : -flow.amount_cents;
    spent.set(flow.category_id, (spent.get(flow.category_id) ?? 0) + signed);
  }
  return spent;
}

export async function getBudgetView(sql: Sql, month: string): Promise<BudgetView> {
  const { from, to } = monthRange(month);
  // One round trip: categories are only needed after the flows arrive.
  const [categories, budgetRows, flows, history] = await Promise.all([
    repo.listCategories(sql, true),
    repo.listBudgets(sql, from),
    repo.categoryFlows(sql, from, to),
    repo.monthlyExpense(sql, monthRange(shiftMonth(month, -5)).from, to),
  ]);
  const spent = spendFrom(flows, categories);
  const lines = budgetLines(categories, effectiveBudgets(budgetRows, from), spent);
  const parents = lines.filter((line) => line.parent_slug === null);

  const months = Array.from({ length: 6 }, (_, index) => shiftMonth(month, index - 5));
  const parentOf = new Map(categories.map((category) => [category.id, category.parent_id ?? category.id]));
  const slugOf = new Map(categories.map((category) => [category.id, category.slug]));
  const byCategory: Record<string, number[]> = {};
  for (const row of history) {
    const slug = slugOf.get(parentOf.get(row.category_id) ?? row.category_id);
    const index = months.indexOf(row.month);
    if (!slug || index < 0) continue;
    byCategory[slug] ??= months.map(() => 0);
    (byCategory[slug] as number[])[index] += row.amount_cents;
  }

  return {
    month,
    lines,
    total_budget_cents: parents.reduce((sum, line) => sum + (line.budget_cents ?? 0), 0),
    total_spent_cents: parents.reduce((sum, line) => sum + line.total_spent_cents, 0),
    over: lines.filter((line) => line.over).map((line) => line.slug),
    trend: { months, by_category: byCategory },
  };
}

/** Upserts monthly (or default, month null) budgets; amount_cents null removes one. */
export async function putBudgets(sql: Sql, input: BudgetPut, today: string): Promise<BudgetView> {
  const monthStart = input.month ? `${input.month}-01` : null;
  const resolved = [];
  for (const [index, item] of input.items.entries()) {
    const category = await requireCategoryField(sql, item.category, `items[${index}].category`);
    if (category.kind !== "expense") {
      throw validationError("Budgets are for expense categories.", [
        { field: `items[${index}].category`, message: "must be an expense category" },
      ]);
    }
    resolved.push({ category, amount: item.amount_cents });
  }
  for (const { category, amount } of resolved) {
    if (amount === null) await repo.deleteBudget(sql, category.id, monthStart);
    else await repo.upsertBudget(sql, category.id, monthStart, amount);
  }
  return getBudgetView(sql, input.month ?? today.slice(0, 7));
}
