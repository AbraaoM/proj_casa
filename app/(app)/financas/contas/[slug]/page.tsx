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

      <section className="mt-12 border-t border-line pt-4 dark:border-line-dark md:max-w-3xl">
        <div className="flex items-baseline justify-between gap-4">
          <h2 className="text-lg">Lançamentos</h2>
          <p className={total > 0 ? "font-display text-2xl leading-none" : "text-sm text-ink-faint"}>{total}</p>
        </div>
        <TransactionList transactions={transactions} />
        {upcoming.length > 0 ? (
          <p className="mt-4 text-sm text-ink-muted">
            {upcoming.length === 1 ? "1 lançamento futuro" : `${upcoming.length} lançamentos futuros`} (parcelas ou agendados) ainda não contam no saldo.
          </p>
        ) : null}
        {total > transactions.length ? (
          <p className="mt-4 text-sm text-ink-muted">Mostrando os {transactions.length} mais recentes.</p>
        ) : null}
      </section>
    </FinancePage>
  );
}
