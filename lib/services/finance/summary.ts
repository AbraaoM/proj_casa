import type { Sql } from "@/lib/db/client";
import { addDays, daysUntil } from "@/lib/domain/dates";
import { monthRange } from "@/lib/domain/finance/dates";
import { netWorth, type NetWorth } from "@/lib/domain/finance/money";
import type { FinBill, FinTransaction } from "@/lib/domain/finance/types";
import * as repo from "@/lib/repositories/finance";
import { listAccountViews, type AccountView } from "@/lib/services/finance/accounts";
import { getBudgetView, type BudgetView } from "@/lib/services/finance/budgets";

export type CategoryTotal = {
  slug: string;
  name: string;
  amount_cents: number;
  children: Array<{ slug: string; name: string; amount_cents: number }>;
};

export type DueBill = FinBill & { days_until_due: number; overdue: boolean };

export type FinanceSummary = {
  month: string;
  today: string;
  income_cents: number;
  expense_cents: number;
  result_cents: number;
  net_worth: NetWorth;
  accounts: AccountView[];
  expense_by_category: CategoryTotal[];
  income_by_category: Array<{ slug: string; name: string; amount_cents: number }>;
  budget: Pick<BudgetView, "total_budget_cents" | "total_spent_cents" | "over" | "lines">;
  bills_due: DueBill[];
  suggested_bills: FinBill[];
  recent: FinTransaction[];
  /** Transactions without an account do not move any balance. */
  without_account_count: number;
};

/** Everything James needs to answer "how are the finances?" for one month, in one call. */
export async function getFinanceSummary(sql: Sql, month: string, today: string): Promise<FinanceSummary> {
  const { from, to } = monthRange(month);
  const [categories, flows, accounts, budget, bills, recent, noAccount] = await Promise.all([
    repo.listCategories(sql, true),
    repo.categoryFlows(sql, from, to),
    listAccountViews(sql, today),
    getBudgetView(sql, month),
    repo.listBills(sql, ["active", "suggested"]),
    repo.listTransactions(sql, {
      from, to, account: null, category: null, kind: null, status: null, source: null, bill: null,
      origin: null, q: null, include_voided: false, limit: 8, offset: 0,
    }),
    sql.query<{ n: number }>(
      `SELECT count(*)::int AS n FROM fin_transactions WHERE voided_at IS NULL AND account_id IS NULL AND kind <> 'transfer' AND date BETWEEN $1::date AND $2::date`,
      [from, to],
    ),
  ]);

  const byId = new Map(categories.map((category) => [category.id, category]));
  let income = 0;
  let expense = 0;
  const expenseByCategory = new Map<string, number>();
  const incomeByCategory = new Map<string, number>();
  for (const flow of flows) {
    const category = byId.get(flow.category_id);
    if (!category) continue;
    if (category.kind === "income") {
      // An "expense" on an income category would be odd; it reduces that income.
      const signed = flow.kind === "income" ? flow.amount_cents : -flow.amount_cents;
      income += signed;
      incomeByCategory.set(category.id, (incomeByCategory.get(category.id) ?? 0) + signed);
    } else {
      const signed = flow.kind === "expense" ? flow.amount_cents : -flow.amount_cents;
      expense += signed;
      expenseByCategory.set(category.id, (expenseByCategory.get(category.id) ?? 0) + signed);
    }
  }

  const parents = new Map<string, CategoryTotal>();
  for (const [id, amount] of expenseByCategory) {
    const category = byId.get(id);
    if (!category) continue;
    const parent = category.parent_id ? byId.get(category.parent_id) ?? category : category;
    const entry = parents.get(parent.id) ?? { slug: parent.slug, name: parent.name, amount_cents: 0, children: [] };
    entry.amount_cents += amount;
    if (parent.id !== category.id) entry.children.push({ slug: category.slug, name: category.name, amount_cents: amount });
    parents.set(parent.id, entry);
  }
  const expenseList = [...parents.values()]
    .filter((entry) => entry.amount_cents !== 0)
    .map((entry) => ({ ...entry, children: entry.children.sort((a, b) => b.amount_cents - a.amount_cents) }))
    .sort((a, b) => b.amount_cents - a.amount_cents);
  const incomeList = [...incomeByCategory]
    .map(([id, amount]) => ({ slug: byId.get(id)?.slug ?? "", name: byId.get(id)?.name ?? "", amount_cents: amount }))
    .filter((entry) => entry.amount_cents !== 0)
    .sort((a, b) => b.amount_cents - a.amount_cents);

  const horizon = addDays(today, 30);
  const due = bills
    .filter((bill) => bill.status === "active" && bill.next_due_date <= horizon)
    .map((bill) => {
      const days = daysUntil(bill.next_due_date, today);
      return { ...bill, days_until_due: days, overdue: days < 0 };
    });

  return {
    month,
    today,
    income_cents: income,
    expense_cents: expense,
    result_cents: income - expense,
    net_worth: netWorth(accounts),
    accounts,
    expense_by_category: expenseList,
    income_by_category: incomeList,
    budget: {
      total_budget_cents: budget.total_budget_cents,
      total_spent_cents: budget.total_spent_cents,
      over: budget.over,
      lines: budget.lines,
    },
    bills_due: due,
    suggested_bills: bills.filter((bill) => bill.status === "suggested"),
    recent: recent.transactions,
    without_account_count: Number(noAccount[0]?.n ?? 0),
  };
}
