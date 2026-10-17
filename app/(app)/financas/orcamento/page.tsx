import { BudgetBars } from "@/components/finance/budget-bars";
import { FinancePage } from "@/components/finance/finance-page";
import { MonthNav } from "@/components/finance/month-nav";
import { TrendBars } from "@/components/finance/trend-bars";
import { PageNotice } from "@/components/history/page-notice";
import { Stat } from "@/components/history/stat";
import { loadBudgetPage } from "@/lib/services/finance-pages";
import { formatMoney } from "@/lib/ui/format";

export const dynamic = "force-dynamic";

type Props = { searchParams: Promise<{ mes?: string }> };

export default async function BudgetPage({ searchParams }: Props) {
  const { mes } = await searchParams;
  const page = await loadBudgetPage(mes);
  if (page.status !== "ready") return <PageNotice status={page.status} backHref="/financas" />;
  const budget = page.data;
  const left = budget.total_budget_cents - budget.total_spent_cents;
  const parents = budget.lines.filter((line) => line.parent_slug === null);

  return (
    <FinancePage tab="orcamento" month={budget.month} title="Orçamento" aside={<MonthNav month={budget.month} basePath="/financas/orcamento" />}>
      <div className="mt-8 grid grid-cols-2 gap-x-6 gap-y-6 md:grid-cols-3">
        <Stat label="Orçado" value={formatMoney(budget.total_budget_cents)} />
        <Stat label="Gasto" value={formatMoney(budget.total_spent_cents)} />
        <Stat
          label={left >= 0 ? "Sobra" : "Acima"}
          value={budget.total_budget_cents > 0 ? formatMoney(Math.abs(left)) : "—"}
          hint={budget.over.length > 0 ? (budget.over.length === 1 ? "1 categoria estourou" : `${budget.over.length} categorias estouraram`) : null}
        />
      </div>

      <div className="mt-12 grid grid-cols-1 gap-12 md:grid-cols-2 md:gap-16">
        <section className="min-w-0 border-t border-line pt-4 dark:border-line-dark">
          <h2 className="text-lg">Orçado × realizado</h2>
          <BudgetBars lines={budget.lines} month={budget.month} showChildren />
        </section>

        <section className="min-w-0 border-t border-line pt-4 dark:border-line-dark">
          <h2 className="text-lg">Últimos 6 meses</h2>
          {parents.length === 0 ? (
            <p className="mt-4 text-sm text-ink-muted">Sem gastos no período.</p>
          ) : (
            <ul className="mt-4 space-y-4">
              {parents.map((line) => {
                const values = budget.trend.by_category[line.slug] ?? budget.trend.months.map(() => 0);
                const average = Math.round(values.slice(0, 5).reduce((sum, value) => sum + value, 0) / 5);
                return (
                  <li key={line.slug} className="flex items-center justify-between gap-4">
                    <div className="min-w-0">
                      <p className="truncate text-base">{line.name}</p>
                      <p className="mt-1 text-sm text-ink-muted tabular-nums">média {formatMoney(average)}</p>
                    </div>
                    <TrendBars months={budget.trend.months} values={values} label={line.name} />
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      </div>
    </FinancePage>
  );
}
