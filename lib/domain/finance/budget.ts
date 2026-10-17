import type { BudgetRow, CategoryKind } from "@/lib/domain/finance/types";

export type BudgetCategory = { id: string; slug: string; name: string; kind: CategoryKind; parent_id: string | null; sort_order: number };

export type BudgetLine = {
  category_id: string;
  slug: string;
  name: string;
  parent_slug: string | null;
  /** null: no budget set for this category in this month. */
  budget_cents: number | null;
  /** Only this category's own spending (children are separate lines). */
  spent_cents: number;
  /** Spending including children. Same as spent_cents for a child. */
  total_spent_cents: number;
  remaining_cents: number | null;
  over: boolean;
};

/** A month's own budget wins over the category's default (month NULL). */
export function effectiveBudgets(rows: BudgetRow[], monthStart: string): Map<string, number> {
  const result = new Map<string, number>();
  for (const row of rows) if (row.month === null) result.set(row.category_id, row.amount_cents);
  for (const row of rows) if (row.month === monthStart) result.set(row.category_id, row.amount_cents);
  return result;
}

/**
 * Budget against spending for every expense category with a budget or spending.
 * A parent without its own budget uses the sum of its children's budgets.
 */
export function budgetLines(
  categories: BudgetCategory[],
  budgets: Map<string, number>,
  spentByCategory: Map<string, number>,
): BudgetLine[] {
  const expense = categories.filter((category) => category.kind === "expense");
  const byId = new Map(expense.map((category) => [category.id, category]));
  const children = new Map<string, BudgetCategory[]>();
  for (const category of expense) {
    if (category.parent_id) children.set(category.parent_id, [...(children.get(category.parent_id) ?? []), category]);
  }
  const lines: BudgetLine[] = [];
  const parents = expense.filter((category) => !category.parent_id).sort(bySort);
  for (const parent of parents) {
    const kids = (children.get(parent.id) ?? []).sort(bySort);
    const own = spentByCategory.get(parent.id) ?? 0;
    const total = own + kids.reduce((sum, kid) => sum + (spentByCategory.get(kid.id) ?? 0), 0);
    const kidBudgets = kids.map((kid) => budgets.get(kid.id)).filter((value): value is number => value !== undefined);
    const budget = budgets.get(parent.id) ?? (kidBudgets.length > 0 ? kidBudgets.reduce((a, b) => a + b, 0) : null);
    if (budget !== null || total !== 0) lines.push(line(parent, null, budget, own, total));
    for (const kid of kids) {
      const spent = spentByCategory.get(kid.id) ?? 0;
      const kidBudget = budgets.get(kid.id) ?? null;
      if (kidBudget !== null || spent !== 0) lines.push(line(kid, byId.get(parent.id)?.slug ?? null, kidBudget, spent, spent));
    }
  }
  return lines;
}

function line(
  category: BudgetCategory,
  parentSlug: string | null,
  budget: number | null,
  spent: number,
  total: number,
): BudgetLine {
  return {
    category_id: category.id,
    slug: category.slug,
    name: category.name,
    parent_slug: parentSlug,
    budget_cents: budget,
    spent_cents: spent,
    total_spent_cents: total,
    remaining_cents: budget === null ? null : budget - total,
    over: budget !== null && total > budget,
  };
}

function bySort(a: BudgetCategory, b: BudgetCategory) {
  return a.sort_order - b.sort_order || a.name.localeCompare(b.name, "pt-BR");
}
