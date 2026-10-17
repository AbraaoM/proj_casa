import { addDays } from "@/lib/domain/dates";
import { netWorth, type NetWorth } from "@/lib/domain/finance/money";
import type { FinCategory, FinTransaction } from "@/lib/domain/finance/types";
import { parseTransactionListQuery, type TransactionListQuery } from "@/lib/domain/finance/validate";
import { listCategories } from "@/lib/repositories/finance";
import { getAccountView, listAccountViews, type AccountView } from "@/lib/services/finance/accounts";
import { getFinanceSummary, type FinanceSummary } from "@/lib/services/finance/summary";
import { listTransactions } from "@/lib/services/finance/transactions";
import { withDatabase, type PageLoad } from "@/lib/services/subject-pages";
import { pickMonth } from "@/lib/ui/finance";

export async function loadFinanceMonth(mes: string | undefined): Promise<PageLoad<FinanceSummary>> {
  return withDatabase((sql, today) => getFinanceSummary(sql, pickMonth(mes, today), today));
}

export type TransactionsPage = {
  month: string;
  /** ?mes=todos, or a sector filter without a month: every month at once. */
  all_months: boolean;
  filters: { kind: string | null; account: string | null; category: string | null; origin: string | null };
  transactions: FinTransaction[];
  total: number;
  totals: { income_cents: number; expense_cents: number };
  accounts: AccountView[];
  categories: FinCategory[];
};

export async function loadTransactionsPage(params: {
  mes?: string;
  tipo?: string;
  conta?: string;
  categoria?: string;
  origem?: string;
}): Promise<PageLoad<TransactionsPage>> {
  return withDatabase(async (sql, today) => {
    const month = pickMonth(params.mes, today);
    const allMonths = params.mes === "todos" || (Boolean(params.origem) && !params.mes);
    const search = new URLSearchParams(allMonths ? { limit: "500" } : { month, limit: "500" });
    const kind = ["expense", "income", "transfer"].includes(params.tipo ?? "") ? (params.tipo as string) : null;
    if (kind) search.set("kind", kind);
    if (params.conta) search.set("account", params.conta);
    if (params.categoria) search.set("category", params.categoria);
    if (params.origem) search.set("origin", params.origem);
    const parsed = parseTransactionListQuery(search);
    // A malformed filter just shows the unfiltered month.
    const query: TransactionListQuery = parsed.ok
      ? parsed.value
      : (parseTransactionListQuery(new URLSearchParams({ month, limit: "500" })) as { ok: true; value: TransactionListQuery }).value;
    const [{ transactions, total }, accounts, categories] = await Promise.all([
      listTransactions(sql, query),
      listAccountViews(sql, today),
      listCategories(sql, false),
    ]);
    let income = 0;
    let expense = 0;
    for (const tx of transactions) {
      if (tx.kind === "transfer") continue;
      const isIncomeCategory = tx.category_kind === "income";
      const signed = tx.kind === "income" ? tx.amount_cents : -tx.amount_cents;
      if (isIncomeCategory) income += signed;
      else expense -= signed;
    }
    return {
      month,
      all_months: allMonths,
      filters: {
        kind: parsed.ok ? kind : null,
        account: parsed.ok ? query.account : null,
        category: parsed.ok ? query.category : null,
        origin: parsed.ok && params.origem ? params.origem : null,
      },
      transactions,
      total,
      totals: { income_cents: income, expense_cents: expense },
      accounts,
      categories,
    };
  });
}

export async function loadAccountsPage(): Promise<PageLoad<{ accounts: AccountView[]; net_worth: NetWorth }>> {
  return withDatabase(async (sql, today) => {
    const accounts = await listAccountViews(sql, today);
    return { accounts, net_worth: netWorth(accounts) };
  });
}

export type AccountPage = {
  account: AccountView;
  /** Up to today, newest first. */
  transactions: FinTransaction[];
  total: number;
  /** After today (installments, scheduled), soonest first. */
  upcoming: FinTransaction[];
};

export async function loadAccountPage(slug: string): Promise<PageLoad<AccountPage>> {
  if (!/^[a-z0-9_]{1,40}$/.test(slug)) return { status: "not_found" };
  return withDatabase(async (sql, today) => {
    const account = await getAccountView(sql, slug, today);
    const tomorrow = addDays(today, 1);
    const past = parseTransactionListQuery(new URLSearchParams({ account: account.id, to: today, limit: "60" }));
    const future = parseTransactionListQuery(new URLSearchParams({ account: account.id, from: tomorrow, limit: "120" }));
    if (!past.ok || !future.ok) return null;
    const [{ transactions, total }, upcoming] = await Promise.all([
      listTransactions(sql, past.value),
      listTransactions(sql, future.value),
    ]);
    return { account, transactions, total, upcoming: upcoming.transactions.reverse() };
  });
}
