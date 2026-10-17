import { attentionPhrase } from "@/lib/domain/attention";
import { FinancePage } from "@/components/finance/finance-page";
import { SuggestedBills } from "@/components/finance/suggested-bills";
import { PageNotice } from "@/components/history/page-notice";
import { Stat } from "@/components/history/stat";
import { loadBillsPage } from "@/lib/services/finance-pages";
import { markerClass } from "@/lib/ui/attention";
import { BILL_KIND_LABELS, dueAttention, frequencyPhrase } from "@/lib/ui/finance";
import { formatDate, formatMoney } from "@/lib/ui/format";

export const dynamic = "force-dynamic";

const STATUS = { paused: "pausada", ended: "encerrada", active: "ativa", suggested: "sugerida" } as const;

export default async function BillsPage() {
  const page = await loadBillsPage();
  if (page.status !== "ready") return <PageNotice status={page.status} backHref="/financas" />;
  const { active, suggested, inactive, monthly_total_cents } = page.data;
  const overdue = active.filter((bill) => bill.days_until_due < 0).length;

  return (
    <FinancePage tab="a-pagar" title="A pagar">
      <div className="mt-8 grid grid-cols-2 gap-x-6 gap-y-6 md:grid-cols-3">
        <Stat label="Por mês" value={formatMoney(monthly_total_cents)} hint="o que se repete, em média" />
        <Stat label="Ativas" value={String(active.length)} hint={overdue > 0 ? (overdue === 1 ? "1 atrasada" : `${overdue} atrasadas`) : "nenhuma atrasada"} />
      </div>

      <div className="mt-12 grid grid-cols-1 gap-12 md:grid-cols-[minmax(0,3fr)_minmax(0,2fr)] md:gap-16">
        <section className="min-w-0 border-t border-line pt-4 dark:border-line-dark">
          <h2 className="text-lg">Por vencimento</h2>
          {active.length === 0 ? (
            <p className="mt-4 text-sm text-ink-muted">Nenhuma conta cadastrada. Conte ao James o que vence todo mês.</p>
          ) : (
            <ul className="mt-4 space-y-6">
              {active.map((bill) => {
                const attention = dueAttention(bill.days_until_due);
                return (
                  <li key={bill.id} className={`border-l-2 pl-3 ${markerClass(attention)}`}>
                    <div className="flex items-baseline justify-between gap-4">
                      <p className="min-w-0 break-words text-base">{bill.name}</p>
                      <p className="shrink-0 text-sm tabular-nums">
                        {bill.amount_varies ? "~" : ""}
                        {bill.kind === "income" ? "+" : ""}
                        {formatMoney(bill.amount_cents)}
                      </p>
                    </div>
                    <p className="mt-1 text-sm text-ink-muted">
                      {attentionPhrase(attention, bill.days_until_due)} · {formatDate(bill.next_due_date)}
                    </p>
                    <p className="mt-1 text-sm text-ink-muted">
                      {[
                        bill.kind !== "bill" ? BILL_KIND_LABELS[bill.kind] : null,
                        frequencyPhrase(bill.frequency, bill.interval),
                        bill.category_name,
                        bill.account_slug ? `conta ${bill.account_slug}` : null,
                        bill.autopay ? "débito automático" : null,
                        bill.remaining !== null ? (bill.remaining === 1 ? "falta 1" : `faltam ${bill.remaining}`) : null,
                      ]
                        .filter(Boolean)
                        .join(" · ")}
                    </p>
                    {bill.payments.length > 0 ? (
                      <ul className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-ink-muted" aria-label={`Pagamentos de ${bill.name}`}>
                        {bill.payments.map((payment) => (
                          <li key={payment.id} className="tabular-nums">
                            {formatDate(payment.date)} · {formatMoney(payment.amount_cents)}
                          </li>
                        ))}
                      </ul>
                    ) : null}
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        <div className="min-w-0 space-y-12">
          {suggested.length > 0 ? (
            <section className="border-t border-line pt-4 dark:border-line-dark">
              <h2 className="text-lg">Sugeridas</h2>
              <SuggestedBills bills={suggested} />
            </section>
          ) : null}
          {inactive.length > 0 ? (
            <section className="border-t border-line pt-4 dark:border-line-dark">
              <h2 className="text-lg">Pausadas e encerradas</h2>
              <ul className="mt-4 space-y-3">
                {inactive.map((bill) => (
                  <li key={bill.id} className="flex items-baseline justify-between gap-4 text-sm text-ink-muted">
                    <span className="min-w-0 break-words">{bill.name}</span>
                    <span className="shrink-0">{STATUS[bill.status]}</span>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}
        </div>
      </div>
    </FinancePage>
  );
}
