import Link from "next/link";
import { Car, ChevronRight, CloudRain, Dog, House, Users, Wallet, type LucideIcon } from "lucide-react";
import { AttentionMark, EmptyNote } from "@/components/ui/attention-mark";
import { attentionPhrase } from "@/lib/domain/attention";
import { DOMAINS, type Domain } from "@/lib/domain/types";
import { SuggestedBills } from "@/components/finance/suggested-bills";
import { ItemActions } from "@/components/one-tap/item-actions";
import { monthLabel } from "@/lib/domain/history";
import type { DashboardData, DashboardFinance } from "@/lib/services/dashboard";
import { formatMoney } from "@/lib/ui/format";
import { markerClass, priorityWord } from "@/lib/ui/attention";

const LABELS: Record<Domain, string> = {
  dog: "Cães",
  house: "Casa",
  finance: "Finanças",
  car: "Carro",
  family: "Família",
};

const ICONS: Record<Domain, LucideIcon> = { dog: Dog, house: House, finance: Wallet, car: Car, family: Users };

/** Sector pages. Domains without a page stay plain text. */
const SECTOR_HREF: Partial<Record<Domain, string>> = {
  dog: "/caes",
  house: "/casa",
  car: "/carros",
  family: "/familia",
  finance: "/financas",
};

export function HomeDashboard({ data }: { data: DashboardData }) {
  const ready = data.status === "ready" ? data : null;
  const attentionCount = ready ? ready.items.length : 0;
  const overdue = ready?.summary.overdue ?? 0;
  const calm = overdue === 0;
  const place = data.weather
    ? `${data.settings.city} · ${data.weather.temperature_c}° · ${data.weather.phrase}`
    : null;

  return (
    <main className="mx-auto w-full max-w-3xl px-5 py-8 md:max-w-5xl md:px-10 md:py-12">
      <section className="max-w-xl">
        {ready && attentionCount > 0 ? (
          <p
            className={`font-display text-7xl leading-none tracking-tight md:text-8xl ${
              calm ? "text-accent" : "text-black dark:text-white"
            }`}
          >
            {attentionCount}
          </p>
        ) : null}
        <h1
          className={`font-display text-3xl leading-tight tracking-tight md:text-4xl ${
            ready && attentionCount === 0 ? "text-accent" : ""
          } ${ready && attentionCount > 0 ? "mt-3" : ""}`}
        >
          {headline(data, attentionCount)}
        </h1>
        {notice(data) ? <p className="mt-3 max-w-md text-base text-ink-muted">{notice(data)}</p> : null}
        {place ? <p className="mt-4 text-sm text-ink-muted">{place}</p> : null}
      </section>

      <div className="mt-10 grid gap-4 md:grid-cols-2 md:gap-6">
        {DOMAINS.map((domain) => {
          const items = ready?.items.filter((item) => item.domain === domain) ?? [];
          const count = ready?.summary.by_domain[domain].total_active ?? 0;
          const href = SECTOR_HREF[domain];
          const shortcuts = ready?.subjects[domain] ?? [];
          const Icon = ICONS[domain];
          const label = (
            <>
              <Icon aria-hidden className="h-5 w-5 shrink-0 text-ink-muted" strokeWidth={1.75} />
              {LABELS[domain]}
            </>
          );
          return (
            <section key={domain} className="rounded-xl border border-line p-4 pt-1 dark:border-line-dark">
              <h2 className="text-lg">
                {href ? (
                  <Link
                    href={href}
                    className="group -mx-4 flex min-h-14 items-center gap-2 rounded-t-xl px-4 transition-colors duration-300 hover:text-accent-dark focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-accent active:bg-line/50 dark:hover:text-accent-light dark:active:bg-line-dark"
                  >
                    {label}
                    <SectorCount ready={Boolean(ready)} count={count} />
                    <ChevronRight aria-hidden className="h-5 w-5 shrink-0 text-ink-faint transition-transform duration-300 group-hover:translate-x-0.5" strokeWidth={1.75} />
                  </Link>
                ) : (
                  <span className="flex min-h-14 items-center gap-2">
                    {label}
                    <SectorCount ready={Boolean(ready)} count={count} />
                  </span>
                )}
              </h2>
              {shortcuts.length > 0 ? (
                <ul className="mt-3 flex flex-wrap gap-2" aria-label={`${LABELS[domain]}: atalhos`}>
                  {shortcuts.map((subject) => (
                    <li key={subject.id}>
                      <Link
                        href={subject.href}
                        className="inline-flex min-h-11 items-center rounded-md border border-line px-3 text-sm text-ink-muted transition-colors duration-300 hover:border-black hover:text-black focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent dark:border-line-dark dark:hover:border-white dark:hover:text-white"
                      >
                        {subject.name}
                      </Link>
                    </li>
                  ))}
                </ul>
              ) : null}
              {domain === "finance" && ready?.finance ? <FinanceLine finance={ready.finance} /> : null}
              {domain === "house" && data.weather?.outdoor_delay ? (
                <p className="mt-3 flex items-center gap-2 text-sm text-ink-muted">
                  <CloudRain aria-hidden className="h-4 w-4 shrink-0" strokeWidth={1.75} />
                  Chuva prevista hoje. Tarefas externas podem esperar.
                </p>
              ) : null}
              {items.length === 0 ? (
                ready ? (
                <EmptyNote>Nada pendente</EmptyNote>
              ) : (
                <p className="mt-4 text-sm text-ink-muted">Sem dados</p>
              )
              ) : (
                <ul className="mt-4 space-y-4">
                  {items.map((item) => (
                    <li
                      key={item.id}
                      className={`border-l-2 pl-3 ${markerClass(item.attention)}`}
                    >
                      <p className="text-base">
                        <AttentionMark attention={item.attention} />
                        {item.title}
                        {item.subject_name ? <span className="text-ink-muted"> · {item.subject_name}</span> : null}
                      </p>
                      <p className="mt-1 text-sm text-ink-muted">
                        {attentionPhrase(item.attention, item.days_until_due, item.next_due_time ?? null)}
                        {priorityWord(item.priority) ? ` · ${priorityWord(item.priority)}` : ""}
                      </p>
                      <ItemActions item={item} bill={ready?.finance?.bills[item.id] ?? null} />
                    </li>
                  ))}
                </ul>
              )}
              {domain === "finance" && ready?.finance ? <SuggestedBills bills={ready.finance.suggested} compact /> : null}
            </section>
          );
        })}
      </div>
    </main>
  );
}

function SectorCount({ ready, count }: { ready: boolean; count: number }) {
  return (
    <span className={`ml-auto ${count > 0 ? "font-display text-2xl leading-none" : "text-sm text-ink-faint"}`}>
      {ready ? count : "—"}
    </span>
  );
}

function FinanceLine({ finance }: { finance: DashboardFinance }) {
  const month = monthLabel(finance.month).split(" ")[0]?.toLocaleLowerCase("pt-BR");
  const over = finance.budget_cents > 0 && finance.expense_cents > finance.budget_cents;
  return (
    <p className="mt-3 text-sm text-ink-muted">
      Saídas de {month}:{" "}
      <span className={`tabular-nums ${over ? "font-semibold text-black dark:text-white" : "text-black dark:text-white"}`}>
        {formatMoney(finance.expense_cents)}
      </span>
      {finance.budget_cents > 0 ? ` de ${formatMoney(finance.budget_cents)} orçados` : ""}
    </p>
  );
}

function headline(data: DashboardData, count: number): string {
  if (data.status === "unconfigured") return "O banco ainda não está ligado.";
  if (data.status === "schema_missing") return "As tabelas ainda não existem.";
  if (data.status === "error") return "Não consegui ler as pendências.";
  if (count === 0) return "Nada pede atenção";
  if (count === 1) return "coisa pede atenção";
  return "coisas pedem atenção";
}

function notice(data: DashboardData): string | null {
  if (data.status === "unconfigured") return "Defina DATABASE_URL para ver o que pede atenção.";
  if (data.status === "schema_missing") return "Rode npm run db:migrate.";
  if (data.status === "error") return "O banco respondeu com erro.";
  return null;
}
