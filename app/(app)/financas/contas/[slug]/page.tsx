import { BackLink } from "@/components/history/back-link";
import { FinancePage } from "@/components/finance/finance-page";
import { TransactionList } from "@/components/finance/transaction-list";
import { PageNotice } from "@/components/history/page-notice";
import { Stat } from "@/components/history/stat";
import { loadAccountPage } from "@/lib/services/finance-pages";
import { ACCOUNT_KIND_LABELS } from "@/lib/ui/finance";
import { formatDate, formatMoney } from "@/lib/ui/format";

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ slug: string }> };

export default async function AccountPage({ params }: Props) {
  const { slug } = await params;
  const page = await loadAccountPage(slug);
  if (page.status !== "ready") return <PageNotice status={page.status} backHref="/financas/contas" />;
  const { account, transactions, total, upcoming } = page.data;
  const check = account.last_check;
  const upcomingTotal = upcoming.reduce((sum, tx) => sum + (tx.kind === "expense" ? tx.amount_cents : 0), 0);

  return (
    <FinancePage tab="contas" eyebrow={ACCOUNT_KIND_LABELS[account.kind] + (account.archived_at ? " · arquivada" : "")} title={account.name}>
      <div className="mt-6">
        <BackLink href="/financas/contas" label="Contas" />
      </div>
      <div className="mt-8 grid grid-cols-2 gap-x-6 gap-y-6 md:grid-cols-4">
        <Stat label={account.is_liability ? "Devendo hoje" : "Saldo hoje"} value={formatMoney(account.balance_cents)} />
        {account.credit_limit_cents !== null ? (
          <Stat label="Limite livre" value={formatMoney(account.available_credit_cents ?? 0)} hint={`de ${formatMoney(account.credit_limit_cents)}`} />
        ) : null}
        <Stat
          label="Saldo informado"
          value={check ? formatMoney(check.balance_cents) : "—"}
          hint={
            check
              ? check.difference_cents === 0
                ? `confere em ${formatDate(check.date)}`
                : `em ${formatDate(check.date)} · diferença de ${formatMoney(check.difference_cents)}`
              : "o James registra quando você contar"
          }
        />
      </div>

      {account.statement ? (
        <section className="mt-12 border-t border-line pt-4 dark:border-line-dark md:max-w-3xl">
          <div className="flex items-baseline justify-between gap-4">
            <h2 className="text-lg">Fatura aberta</h2>
            <p className="font-display text-2xl leading-none tabular-nums">{formatMoney(account.statement.total_cents)}</p>
          </div>
          <p className="mt-2 text-sm text-ink-muted">
            Compras de {formatDate(account.statement.from)} a {formatDate(account.statement.to)}
            {account.statement.due_date ? ` · vence em ${formatDate(account.statement.due_date)}` : ""}. Cada compra conta no mês em que foi feita; pagar a fatura é transferência.
          </p>
        </section>
      ) : null}

      {upcoming.length > 0 ? (
        <section className="mt-12 border-t border-line pt-4 dark:border-line-dark md:max-w-3xl">
          <div className="flex items-baseline justify-between gap-4">
            <h2 className="text-lg">Próximos lançamentos</h2>
            <p className="font-display text-2xl leading-none tabular-nums">{formatMoney(upcomingTotal)}</p>
          </div>
          <ul className="mt-4 space-y-3">
            {upcoming.slice(0, 12).map((tx) => (
              <li key={tx.id} className="flex items-baseline justify-between gap-4 text-sm">
                <span className="min-w-0 break-words">
                  <span className="tabular-nums text-ink-muted">{formatDate(tx.date)}</span> · {tx.description}
                  {tx.installment_n && tx.installment_total ? <span className="text-ink-muted"> · {tx.installment_n}/{tx.installment_total}</span> : null}
                </span>
                <span className="shrink-0 tabular-nums">{formatMoney(tx.amount_cents)}</span>
              </li>
            ))}
          </ul>
          {upcoming.length > 12 ? <p className="mt-3 text-sm text-ink-muted">E mais {upcoming.length - 12}.</p> : null}
        </section>
      ) : null}

      <section className="mt-12 border-t border-line pt-4 dark:border-line-dark md:max-w-3xl">
        <div className="flex items-baseline justify-between gap-4">
          <h2 className="text-lg">Lançamentos</h2>
          <p className={total > 0 ? "font-display text-2xl leading-none" : "text-sm text-ink-faint"}>{total}</p>
        </div>
        <TransactionList transactions={transactions} />
        {total > transactions.length ? (
          <p className="mt-4 text-sm text-ink-muted">Mostrando os {transactions.length} mais recentes.</p>
        ) : null}
      </section>
    </FinancePage>
  );
}
