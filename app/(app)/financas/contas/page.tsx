import Link from "next/link";
import { FinancePage } from "@/components/finance/finance-page";
import { PageNotice } from "@/components/history/page-notice";
import { Stat } from "@/components/history/stat";
import { loadAccountsPage } from "@/lib/services/finance-pages";
import { ACCOUNT_KIND_LABELS } from "@/lib/ui/finance";
import { formatMoney } from "@/lib/ui/format";

export const dynamic = "force-dynamic";

export default async function AccountsPage() {
  const page = await loadAccountsPage();
  if (page.status !== "ready") return <PageNotice status={page.status} backHref="/financas" />;
  const { accounts, net_worth } = page.data;

  return (
    <FinancePage tab="contas" title="Contas">
      <div className="mt-8 grid grid-cols-2 gap-x-6 gap-y-6 md:grid-cols-3">
        <Stat label="Saldo líquido" value={formatMoney(net_worth.net_cents)} />
        <Stat label="Em contas" value={formatMoney(net_worth.assets_cents)} />
        <Stat label="Dívidas" value={formatMoney(net_worth.liabilities_cents)} hint="cartões e empréstimos" />
      </div>

      {accounts.length === 0 ? (
        <p className="mt-10 text-sm text-ink-muted">Nenhuma conta ainda. Conte ao seu agente suas contas e saldos, e ele cadastra.</p>
      ) : (
        <ul className="mt-10 grid grid-cols-1 gap-x-16 md:grid-cols-2">
          {accounts.map((account) => (
            <li key={account.id} className="border-t border-line dark:border-line-dark">
              <Link
                href={`/financas/contas/${account.slug}`}
                className="group flex items-baseline justify-between gap-4 py-5 transition-colors duration-300 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
              >
                <div className="min-w-0">
                  <p className="break-words text-lg transition-colors duration-300 group-hover:text-accent-dark dark:group-hover:text-accent-light">{account.name}</p>
                  <p className="mt-1 text-sm text-ink-muted">
                    {ACCOUNT_KIND_LABELS[account.kind]}
                    {account.last_check && account.last_check.difference_cents !== 0 ? " · saldo não confere" : ""}
                  </p>
                </div>
                <div className="shrink-0 text-right">
                  <p className="font-display text-2xl leading-none tabular-nums">{formatMoney(account.balance_cents)}</p>
                  {account.is_liability ? <p className="mt-1 text-xs text-ink-muted">a pagar</p> : null}
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </FinancePage>
  );
}
