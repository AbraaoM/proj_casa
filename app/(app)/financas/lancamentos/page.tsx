import Link from "next/link";
import { FinancePage } from "@/components/finance/finance-page";
import { MonthNav } from "@/components/finance/month-nav";
import { TransactionList } from "@/components/finance/transaction-list";
import { PageNotice } from "@/components/history/page-notice";
import { loadTransactionsPage } from "@/lib/services/finance-pages";
import { formatMoney } from "@/lib/ui/format";

export const dynamic = "force-dynamic";

type Search = { mes?: string; tipo?: string; conta?: string; categoria?: string; origem?: string };
type Props = { searchParams: Promise<Search> };

const KINDS = [
  { value: null, label: "Tudo" },
  { value: "expense", label: "Saídas" },
  { value: "income", label: "Entradas" },
  { value: "transfer", label: "Transferências" },
] as const;

function chipClass(selected: boolean) {
  return `inline-block whitespace-nowrap border px-3 py-1.5 text-sm transition-colors duration-300 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent ${
    selected
      ? "border-black bg-black text-white dark:border-white dark:bg-white dark:text-black"
      : "border-line text-ink-muted hover:border-black hover:text-black dark:border-line-dark dark:hover:border-white dark:hover:text-white"
  }`;
}

export default async function TransactionsPage({ searchParams }: Props) {
  const search = await searchParams;
  const page = await loadTransactionsPage(search);
  if (page.status !== "ready") return <PageNotice status={page.status} backHref="/financas" />;
  const { data } = page;
  const current: Record<string, string | null> = {
    mes: data.all_months ? "todos" : data.month,
    tipo: data.filters.kind,
    conta: data.filters.account,
    categoria: data.filters.category,
    origem: data.filters.origin,
  };
  const href = (change: Record<string, string | null>) => {
    const params = new URLSearchParams();
    for (const [key, value] of Object.entries({ ...current, ...change })) if (value) params.set(key, value);
    return `/financas/lancamentos?${params.toString()}`;
  };
  const category = data.categories.find((item) => item.slug === data.filters.category || item.id === data.filters.category);
  const account = data.accounts.find((item) => item.slug === data.filters.account || item.id === data.filters.account);
  type ActiveFilter = { label: string; clear: Record<string, string | null> };
  const active: ActiveFilter[] = [];
  if (category) active.push({ label: category.name, clear: { categoria: null } });
  if (data.filters.origin) active.push({ label: originLabel(data.filters.origin, data.transactions), clear: { origem: null } });

  return (
    <FinancePage
      tab="lancamentos"
      month={data.month}
      title="Lançamentos"
      aside={data.all_months ? null : <MonthNav month={data.month} basePath="/financas/lancamentos" params={{ ...current, mes: null }} />}
    >
      <nav aria-label="Filtrar" className="-mx-5 mt-6 space-y-3 overflow-x-auto px-5 md:mx-0 md:px-0">
        <ul className="flex gap-2 md:flex-wrap">
          <li>
            <Link href={href({ mes: data.all_months ? data.month : "todos" })} scroll={false} aria-current={data.all_months ? "true" : undefined} className={chipClass(data.all_months)}>
              Todos os meses
            </Link>
          </li>
          {KINDS.map((kind) => (
            <li key={kind.label}>
              <Link href={href({ tipo: kind.value })} scroll={false} aria-current={data.filters.kind === kind.value ? "true" : undefined} className={chipClass(data.filters.kind === kind.value)}>
                {kind.label}
              </Link>
            </li>
          ))}
        </ul>
        {data.accounts.length > 0 ? (
          <ul className="flex gap-2 md:flex-wrap">
            <li>
              <Link href={href({ conta: null })} scroll={false} className={chipClass(!account)}>
                Todas as contas
              </Link>
            </li>
            {data.accounts.map((item) => (
              <li key={item.id}>
                <Link href={href({ conta: item.slug })} scroll={false} aria-current={account?.id === item.id ? "true" : undefined} className={chipClass(account?.id === item.id)}>
                  {item.name}
                </Link>
              </li>
            ))}
          </ul>
        ) : null}
        {active.length > 0 ? (
          <ul className="flex gap-2 md:flex-wrap">
            {active.map((filter) => (
              <li key={filter.label}>
                <Link href={href(filter.clear)} scroll={false} className={chipClass(true)} aria-label={`Remover filtro ${filter.label}`}>
                  {filter.label} <span aria-hidden="true">×</span>
                </Link>
              </li>
            ))}
          </ul>
        ) : null}
      </nav>

      <dl className="mt-8 flex flex-wrap gap-x-8 gap-y-2 text-sm">
        <div className="flex gap-2">
          <dt className="text-ink-muted">Lançamentos</dt>
          <dd className="tabular-nums">{data.total}</dd>
        </div>
        <div className="flex gap-2">
          <dt className="text-ink-muted">Entradas</dt>
          <dd className="tabular-nums">{formatMoney(data.totals.income_cents)}</dd>
        </div>
        <div className="flex gap-2">
          <dt className="text-ink-muted">Saídas</dt>
          <dd className="tabular-nums">{formatMoney(data.totals.expense_cents)}</dd>
        </div>
      </dl>

      <section className="mt-6 border-t border-line pt-2 dark:border-line-dark md:max-w-3xl">
        <TransactionList transactions={data.transactions} emptyText="Nenhum lançamento com esses filtros." />
      </section>
    </FinancePage>
  );
}

const ORIGINS: Record<string, string> = { dog: "Cães", car: "Carro", house: "Casa", family: "Família", finance: "Finanças" };

/** "Thor" when the filter names one subject and a transaction shows its name; else the sector. */
function originLabel(origin: string, transactions: Array<{ origin_subject_name: string | null }>): string {
  const [domain, id] = origin.split(":");
  const sector = ORIGINS[domain ?? ""] ?? "Setor";
  const name = id ? transactions.find((tx) => tx.origin_subject_name)?.origin_subject_name : null;
  return name ? `${sector} · ${name}` : sector;
}
