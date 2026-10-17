import Link from "next/link";
import { attentionPhrase } from "@/lib/domain/attention";
import { DOMAINS, type Domain } from "@/lib/domain/types";
import type { DashboardData } from "@/lib/services/dashboard";
import { markerClass, priorityWord } from "@/lib/ui/attention";

const LABELS: Record<Domain, string> = {
  dog: "Cães",
  house: "Casa",
  finance: "Finanças",
  car: "Carro",
  family: "Família",
};

/** Sector pages. Domains without a page stay plain text. */
const SECTOR_HREF: Partial<Record<Domain, string>> = {
  dog: "/caes",
  car: "/carros",
  family: "/familia",
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

      <div className="mt-12 grid gap-10 md:grid-cols-2 md:gap-x-16 md:gap-y-12">
        {DOMAINS.map((domain) => {
          const items = ready?.items.filter((item) => item.domain === domain) ?? [];
          const count = ready?.summary.by_domain[domain].total_active ?? 0;
          const href = SECTOR_HREF[domain];
          const shortcuts = ready?.subjects[domain] ?? [];
          return (
            <section key={domain} className="border-t border-line pt-4 dark:border-line-dark">
              <div className="flex items-baseline justify-between gap-4">
                <h2 className="text-lg">
                  {href ? (
                    <Link
                      href={href}
                      className="group inline-flex items-baseline gap-2 transition-colors duration-300 hover:text-accent-dark focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent dark:hover:text-accent-light"
                    >
                      {LABELS[domain]}
                      <span aria-hidden="true" className="text-sm text-ink-faint transition-transform duration-300 group-hover:translate-x-1">
                        →
                      </span>
                    </Link>
                  ) : (
                    LABELS[domain]
                  )}
                </h2>
                <p className={count > 0 ? "font-display text-2xl leading-none" : "text-sm text-ink-faint"}>
                  {ready ? count : "—"}
                </p>
              </div>
              {shortcuts.length > 0 ? (
                <ul className="mt-3 flex flex-wrap gap-2" aria-label={`${LABELS[domain]}: atalhos`}>
                  {shortcuts.map((subject) => (
                    <li key={subject.id}>
                      <Link
                        href={subject.href}
                        className="inline-block border border-line px-3 py-1 text-sm text-ink-muted transition-colors duration-300 hover:border-black hover:text-black focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent dark:border-line-dark dark:hover:border-white dark:hover:text-white"
                      >
                        {subject.name}
                      </Link>
                    </li>
                  ))}
                </ul>
              ) : null}
              {domain === "house" && data.weather?.outdoor_delay ? (
                <p className="mt-3 text-sm text-ink-muted">
                  Chuva prevista hoje. Tarefas externas podem esperar.
                </p>
              ) : null}
              {items.length === 0 ? (
                <p className="mt-4 text-sm text-ink-muted">{ready ? "Nada pendente" : "Sem dados"}</p>
              ) : (
                <ul className="mt-4 space-y-4">
                  {items.map((item) => (
                    <li
                      key={item.id}
                      className={`border-l-2 pl-3 ${markerClass(item.attention)}`}
                    >
                      <p className="text-base">
                        {item.title}
                        {item.subject_name ? <span className="text-ink-muted"> · {item.subject_name}</span> : null}
                      </p>
                      <p className="mt-1 text-sm text-ink-muted">
                        {attentionPhrase(item.attention, item.days_until_due)}
                        {priorityWord(item.priority) ? ` · ${priorityWord(item.priority)}` : ""}
                      </p>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          );
        })}
      </div>
    </main>
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
