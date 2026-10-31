import { BackLink } from "@/components/history/back-link";
import { PageNotice } from "@/components/history/page-notice";
import { DayNav } from "@/components/day/day-nav";
import { LiveRefresh } from "@/components/day/live-refresh";
import { ListSearch } from "@/components/ui/list-search";
import { tryGetSql } from "@/lib/db/client";
import { isMissingSchema } from "@/lib/db/errors";
import { todayInTimeZone } from "@/lib/domain/dates";
import { parseReportDay, type DayPerson } from "@/lib/domain/day-report";
import { loadDayReport } from "@/lib/services/day-report";
import { readSettings } from "@/lib/services/settings";
import { DAY_KIND_LABEL, daySummary } from "@/lib/ui/day";
import { matchesSearch, searchQuery } from "@/lib/ui/search";

export const dynamic = "force-dynamic";

function visiblePeople(people: DayPerson[], query: string): DayPerson[] {
  if (!query) return people;
  return people.flatMap((person) => {
    const deeds = person.deeds.filter((deed) => matchesSearch(query, [deed.title, deed.detail, deed.by, DAY_KIND_LABEL[deed.kind]]));
    return deeds.length > 0 ? [{ name: person.name, deeds }] : [];
  });
}

export default async function HojePage({ searchParams }: { searchParams: Promise<{ dia?: string; q?: string }> }) {
  const params = await searchParams;
  const query = searchQuery(params.q);
  const sql = tryGetSql();
  if (!sql) return <PageNotice status="unconfigured" />;

  let timeZone = "America/Sao_Paulo";
  let today = "";
  try {
    const settings = await readSettings(sql);
    timeZone = settings.timezone;
    today = todayInTimeZone(timeZone);
  } catch (error) {
    if (isMissingSchema(error)) return <PageNotice status="schema_missing" />;
    return <PageNotice status="error" />;
  }

  const parsed = parseReportDay(params.dia, today);
  const day = parsed.ok ? parsed.value : today;
  let report;
  try {
    report = await loadDayReport(sql, { day, timeZone });
  } catch (error) {
    if (isMissingSchema(error)) return <PageNotice status="schema_missing" />;
    return <PageNotice status="error" />;
  }

  const people = visiblePeople(report.people, query);
  const counts = people.reduce(
    (sum, person) => {
      for (const deed of person.deeds) sum[deed.kind] += 1;
      return sum;
    },
    { checklist: 0, task: 0, payment: 0 },
  );
  const summary = daySummary(counts);
  const live = day === today;

  return (
    <main className="mx-auto w-full max-w-3xl px-5 py-8 md:max-w-5xl md:px-10 md:py-12">
      {live ? <LiveRefresh /> : null}
      <BackLink href="/" label="Painel" />
      <h1 className="mt-6 font-display text-5xl leading-none tracking-tight md:text-6xl">Hoje</h1>
      <p className="mt-3 max-w-md text-base text-ink-muted">
        Quem fez o quê: tarefas, pagamentos e checklist.{live ? " Esta tela atualiza sozinha." : ""}
      </p>
      <DayNav day={day} today={today} query={query} />
      {summary ? <p className="mt-4 text-sm text-ink-faint">{summary}</p> : null}
      {report.people.length > 0 || query ? <ListSearch action="/hoje" query={query} placeholder="Buscar pessoa ou registro" hidden={{ dia: day === today ? null : day }} /> : null}

      {people.length === 0 ? (
        <p className="mt-10 text-sm text-ink-muted">
          {query ? "Nada com essa busca." : live ? "Nada registrado ainda hoje." : "Nada registrado nesse dia."}
        </p>
      ) : (
        <div className="mt-10 space-y-10">
          {people.map((person) => (
            <section key={person.name}>
              <h2 className="font-display text-3xl leading-none tracking-tight">{person.name}</h2>
              <ul className="mt-3">
                {person.deeds.map((deed) => (
                  <li key={`${deed.kind}-${deed.id}`} className="border-b border-line py-4 dark:border-line-dark">
                    <p className="text-base">{deed.title}</p>
                    <p className="mt-1 text-sm text-ink-muted">
                      {DAY_KIND_LABEL[deed.kind]}
                      {deed.detail ? ` · ${deed.detail}` : ""}
                      {deed.at ? ` · ${deed.at}` : ""}
                    </p>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}
    </main>
  );
}
