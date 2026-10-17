import Link from "next/link";
import { BillsDue } from "@/components/finance/bills-due";
import { BudgetBars } from "@/components/finance/budget-bars";
import { FinancePage } from "@/components/finance/finance-page";
import { SuggestedBills } from "@/components/finance/suggested-bills";
import { MonthNav } from "@/components/finance/month-nav";
import { TransactionList } from "@/components/finance/transaction-list";
import { PageNotice } from "@/components/history/page-notice";
import { Stat } from "@/components/history/stat";
import { monthLabel } from "@/lib/domain/history";
import { loadFinanceMonth } from "@/lib/services/finance-pages";
import { formatMoney } from "@/lib/ui/format";

export const dynamic = "force-dynamic";

type Props = { searchParams: Promise<{ mes?: string }> };

const MORE =
  "mt-4 inline-block text-sm text-accent-dark underline-offset-4 transition-colors duration-300 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent dark:text-accent-light";

export default async function FinancePageRoute({ searchParams }: Props) {
  const { mes } = await searchParams;
  const page = await loadFinanceMonth(mes);
  if (page.status !== "ready") return <PageNotice status={page.status} />;
  const summary = page.data;
  const monthName = monthLabel(summary.month).split(" ")[0]?.toLocaleLowerCase("pt-BR") ?? "";
  const isCurrent = summary.month === summary.today.slice(0, 7);

  return (
    <FinancePage tab="mes" month={summary.month} eyebrow="Dinheiro da casa" title="Finanças" aside={<MonthNav month={summary.month} basePath="/financas" />}>
      <div className="mt-8 grid grid-cols-2 gap-x-6 gap-y-6 md:grid-cols-4">
        <Stat
          label="Saldo hoje"
          value={summary.accounts.length > 0 ? formatMoney(summary.net_worth.net_cents) : "—"}
          hint={summary.net_worth.liabilities_cents > 0 ? `${formatMoney(summary.net_worth.liabilities_cents)} em dívidas` : null}
        />
        <Stat label={`Resultado de ${monthName}`} value={formatMoney(summary.result_cents)} hint={summary.result_cents >= 0 ? "sobrou" : "faltou"} />
        <Stat label="Entradas" value={formatMoney(summary.income_cents)} />
        <Stat
          label="Saídas"
          value={formatMoney(summary.expense_cents)}
          hint={summary.budget.total_budget_cents > 0 ? `de ${formatMoney(summary.budget.total_budget_cents)} orçados` : null}
        />
      </div>

      {summary.accounts.length === 0 ? (
        <p className="mt-6 border-l-2 border-accent pl-3 text-sm text-ink-muted">
          Nenhuma conta cadastrada. Conte ao James suas contas e saldos, e ele cadastra.
        </p>
      ) : summary.without_account_count > 0 ? (
        <p className="mt-6 text-sm text-ink-muted">
          {summary.without_account_count === 1 ? "1 lançamento" : `${summary.without_account_count} lançamentos`} do mês sem conta. Eles contam no resultado, mas não mexem nos saldos.
        </p>
      ) : null}

      <div className="mt-12 grid grid-cols-1 gap-12 md:grid-cols-2 md:gap-16">
        <div className="min-w-0 space-y-12">
          <section className="border-t border-line pt-4 dark:border-line-dark">
            <div className="flex items-baseline justify-between gap-4">
              <h2 className="text-lg">Contas a pagar</h2>
              <p className={summary.bills_due.length > 0 ? "font-display text-2xl leading-none" : "text-sm text-ink-faint"}>
                {summary.bills_due.length}
              </p>
            </div>
            <BillsDue bills={summary.bills_due} />
            <SuggestedBills bills={summary.suggested_bills} />
            <Link href="/financas/contas-a-pagar" className={MORE}>
              Todas as contas
            </Link>
          </section>

          <section className="border-t border-line pt-4 dark:border-line-dark">
            <h2 className="text-lg">Orçamento</h2>
            <BudgetBars lines={summary.budget.lines} month={summary.month} />
            <Link href={`/financas/orcamento?mes=${summary.month}`} className={MORE}>
              Ver orçamento
            </Link>
          </section>
        </div>

        <div className="min-w-0 space-y-12">
          <section className="border-t border-line pt-4 dark:border-line-dark">
            <h2 className="text-lg">Para onde foi</h2>
            {summary.expense_by_category.length === 0 ? (
              <p className="mt-4 text-sm text-ink-muted">Nenhuma saída {isCurrent ? "neste mês" : `em ${monthName}`}.</p>
            ) : (
              <ul className="mt-4 space-y-4">
                {summary.expense_by_category.map((category) => (
                  <li key={category.slug}>
                    <Link
                      href={`/financas/lancamentos?mes=${summary.month}&categoria=${category.slug}`}
                      className="flex items-baseline justify-between gap-4 transition-colors duration-300 hover:text-accent-dark focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent dark:hover:text-accent-light"
                    >
                      <span className="min-w-0 truncate">{category.name}</span>
                      <span className="shrink-0 tabular-nums">{formatMoney(category.amount_cents)}</span>
                    </Link>
                    {category.children.length > 0 ? (
                      <ul className="mt-1 space-y-1 pl-4 text-sm text-ink-muted">
                        {category.children.map((child) => (
                          <li key={child.slug} className="flex items-baseline justify-between gap-4">
                            <span className="min-w-0 truncate">{child.name}</span>
                            <span className="shrink-0 tabular-nums">{formatMoney(child.amount_cents)}</span>
                          </li>
                        ))}
                      </ul>
                    ) : null}
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="border-t border-line pt-4 dark:border-line-dark">
            <h2 className="text-lg">Últimos lançamentos</h2>
            <TransactionList transactions={summary.recent} />
            {summary.recent.length > 0 ? (
              <Link href={`/financas/lancamentos?mes=${summary.month}`} className={MORE}>
                Ver todos
              </Link>
            ) : null}
          </section>
        </div>
      </div>
    </FinancePage>
  );
}
