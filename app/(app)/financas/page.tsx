import { CircleAlert } from "lucide-react";
import { FinancePage } from "@/components/finance/finance-page";
import { MonthNav } from "@/components/finance/month-nav";
import { PayButton } from "@/components/finance/pay-button";
import { SuggestedBills } from "@/components/finance/suggested-bills";
import { TransactionList } from "@/components/finance/transaction-list";
import { PageNotice } from "@/components/history/page-notice";
import { EmptyNote } from "@/components/ui/attention-mark";
import { RowLink } from "@/components/ui/more-link";
import { centsToReaisInput } from "@/lib/domain/finance/screen-pay";
import { monthLabel } from "@/lib/domain/history";
import { loadFinanceMonth } from "@/lib/services/finance-pages";
import { budgetRatio } from "@/lib/ui/finance";
import { formatDate, formatMoney } from "@/lib/ui/format";

export const dynamic = "force-dynamic";

type Props = { searchParams: Promise<{ mes?: string }> };

const CARD = "mt-4 rounded-xl border border-line px-4 pt-3 dark:border-line-dark";
const SOON_DAYS = 7;

/** One screen to look things up: balance, what is due (with "Paguei"), where the money went, the latest entries. */
export default async function FinancePageRoute({ searchParams }: Props) {
  const { mes } = await searchParams;
  const page = await loadFinanceMonth(mes);
  if (page.status !== "ready") return <PageNotice status={page.status} />;
  const summary = page.data;
  const monthName = monthLabel(summary.month).split(" ")[0]?.toLocaleLowerCase("pt-BR") ?? "";
  const soon = summary.bills_due.filter((bill) => bill.days_until_due <= SOON_DAYS);
  const budgetBySlug = new Map(summary.budget.lines.map((line) => [line.slug, line]));
  const topCategories = summary.expense_by_category.slice(0, 5);
  const onlyAccount = summary.accounts.length === 1 ? summary.accounts[0] : null;
  const totalBudget = summary.budget.total_budget_cents;

  return (
    <FinancePage tab="mes" month={summary.month} eyebrow="Dinheiro da casa" title="Finanças" aside={<MonthNav month={summary.month} basePath="/financas" />}>
      <div className="mt-6 grid gap-x-6 md:grid-cols-2 md:items-start">
        <div className="min-w-0">
          <section aria-label="Saldo" className={`${CARD} pb-4`}>
            <p className="text-sm text-ink-muted">Saldo hoje{onlyAccount ? ` · ${onlyAccount.name}` : ""}</p>
            <p className="mt-1 font-display text-4xl leading-tight tracking-tight tabular-nums">
              {summary.accounts.length > 0 ? formatMoney(summary.net_worth.net_cents) : "—"}
            </p>
            <p className="mt-1 text-sm text-ink-muted">
              Em {monthName}: entrou <span className="text-black tabular-nums dark:text-white">{formatMoney(summary.income_cents)}</span> · saiu{" "}
              <span className="text-black tabular-nums dark:text-white">{formatMoney(summary.expense_cents)}</span>
            </p>
            {totalBudget > 0 ? (
              <>
                <Meter ratio={budgetRatio(summary.budget.total_spent_cents, totalBudget)} over={summary.budget.total_spent_cents > totalBudget} label="Orçamento do mês" />
                <p className="mt-1 text-xs text-ink-muted">
                  {Math.round((summary.budget.total_spent_cents / totalBudget) * 100)}% do orçamento de {formatMoney(totalBudget)}
                </p>
              </>
            ) : null}
            {summary.accounts.length === 0 ? (
              <p className="mt-3 text-sm text-ink-muted">Nenhuma conta cadastrada. Conte ao James suas contas e saldos.</p>
            ) : null}
          </section>

          <section aria-labelledby="vence" className={CARD}>
            <h2 id="vence" className="flex min-h-11 items-center justify-between text-base font-medium">
              Vence em {SOON_DAYS} dias <span className="text-sm font-normal text-ink-muted">{soon.length}</span>
            </h2>
            {soon.length === 0 ? (
              <div className="pb-3">
                <EmptyNote>Nada vence nos próximos {SOON_DAYS} dias.</EmptyNote>
              </div>
            ) : (
              <ul>
                {soon.map((bill) => (
                  <li key={bill.id} className="flex min-h-16 flex-wrap items-center gap-x-3 gap-y-1 border-t border-line py-2 first:border-t-0 dark:border-line-dark">
                    <div className="min-w-0 flex-1">
                      <p className="flex items-center gap-1.5 break-words">
                        {bill.overdue ? <CircleAlert aria-label="Atrasada" role="img" className="h-4 w-4 shrink-0" strokeWidth={2} /> : null}
                        {bill.name}
                      </p>
                      <p className={`text-sm ${bill.overdue ? "font-medium" : "text-ink-muted"}`}>
                        {duePhrase(bill.days_until_due, bill.next_due_date)} · {bill.amount_varies ? "~" : ""}
                        {formatMoney(bill.amount_cents)}
                      </p>
                    </div>
                    {bill.kind === "income" ? null : (
                      <PayButton
                        billId={bill.id}
                        dueDate={bill.next_due_date}
                        name={bill.name}
                        variable={bill.amount_varies}
                        expected={centsToReaisInput(bill.amount_cents)}
                      />
                    )}
                  </li>
                ))}
              </ul>
            )}
            {summary.suggested_bills.length > 0 ? (
              <div className="pb-3">
                <SuggestedBills bills={summary.suggested_bills} />
              </div>
            ) : null}
            <RowLink href="/financas/contas-a-pagar">Todas as contas a pagar</RowLink>
          </section>
        </div>

        <div className="min-w-0">
          <section aria-labelledby="gasto" className={CARD}>
            <h2 id="gasto" className="flex min-h-11 items-center text-base font-medium">
              Gasto de {monthName}
            </h2>
            {topCategories.length === 0 ? (
              <div className="pb-3">
                <EmptyNote>Nenhuma saída em {monthName}.</EmptyNote>
              </div>
            ) : (
              topCategories.map((category) => {
                const line = budgetBySlug.get(category.slug);
                const budget = line?.budget_cents ?? null;
                return (
                  <RowLink
                    key={category.slug}
                    href={`/financas/lancamentos?mes=${summary.month}&categoria=${category.slug}`}
                    detail={<span className="tabular-nums text-black dark:text-white">{formatMoney(category.amount_cents)}</span>}
                  >
                    <span className="block truncate text-base">{category.name}</span>
                    {budget ? (
                      <>
                        <Meter ratio={budgetRatio(category.amount_cents, budget)} over={Boolean(line?.over)} label={`${category.name} no orçamento`} />
                        {line?.over ? <span className="mt-0.5 block text-xs font-semibold">{formatMoney(-(line.remaining_cents ?? 0))} acima</span> : null}
                      </>
                    ) : null}
                  </RowLink>
                );
              })
            )}
            <RowLink href={`/financas/orcamento?mes=${summary.month}`}>Orçamento</RowLink>
          </section>

          <section aria-labelledby="ultimos" className={CARD}>
            <h2 id="ultimos" className="flex min-h-11 items-center text-base font-medium">
              Últimos lançamentos
            </h2>
            <div className="-mt-4 pb-2">
              <TransactionList transactions={summary.recent.slice(0, 5)} />
            </div>
            <RowLink href={`/financas/lancamentos?mes=${summary.month}`}>Ver todos os lançamentos</RowLink>
          </section>

          <section aria-label="Mais em Finanças" className={`${CARD} pt-0`}>
            <RowLink href="/financas/contas" detail={summary.accounts.length > 0 ? String(summary.accounts.length) : null}>
              Contas bancárias
            </RowLink>
          </section>
        </div>
      </div>
    </FinancePage>
  );
}

function Meter({ ratio, over, label }: { ratio: number; over: boolean; label: string }) {
  const percent = Math.round(ratio * 100);
  return (
    <span className="mt-2 block h-1.5 w-full overflow-hidden rounded-full bg-line dark:bg-line-dark" role="meter" aria-label={label} aria-valuemin={0} aria-valuemax={100} aria-valuenow={percent}>
      <span className={`block h-full rounded-full ${over ? "bg-black dark:bg-white" : "bg-accent"}`} style={{ width: `${percent}%` }} />
    </span>
  );
}

function duePhrase(days: number, date: string): string {
  if (days < -1) return `atrasada ${-days} dias`;
  if (days === -1) return "venceu ontem";
  if (days === 0) return "vence hoje";
  if (days === 1) return "vence amanhã";
  return `vence ${formatDate(date)}`;
}
