import { BackLink } from "@/components/history/back-link";
import { PageNotice } from "@/components/history/page-notice";
import { SubjectCard } from "@/components/history/subject-card";
import type { HistorySummary } from "@/lib/domain/history";
import { loadHouseOverview } from "@/lib/services/subject-pages";
import { daysAgoPhrase } from "@/lib/ui/format";
import { AREA_KIND_LABELS, lastCleaning, RAIN_NOTICE } from "@/lib/ui/house";

export const dynamic = "force-dynamic";

function lines(summary: HistorySummary, today: string): string[] {
  const cleaning = lastCleaning(summary);
  const repair = summary.last_by_category.repair;
  return [
    cleaning ? `Limpeza ${daysAgoPhrase(cleaning.done_on, today)}` : null,
    repair ? `Reparo ${daysAgoPhrase(repair.done_on, today)}` : null,
  ].filter((line): line is string => line !== null);
}

export default async function HousePage() {
  const page = await loadHouseOverview();
  if (page.status !== "ready") return <PageNotice status={page.status} />;
  const { today, data } = page;
  const { groups, general, outdoor_delay } = data;
  const hasAreas = groups.length > 0;

  return (
    <main className="mx-auto w-full max-w-3xl px-5 py-8 md:max-w-5xl md:px-10 md:py-12">
      <BackLink href="/" label="Painel" />
      <h1 className="mt-6 font-display text-5xl leading-none tracking-tight md:text-6xl">Casa</h1>
      <p className="mt-3 max-w-md text-base text-ink-muted">Cada cômodo, a área externa e os sistemas da casa, com o que vem pela frente e o que já foi feito.</p>
      {!hasAreas ? (
        <p className="mt-8 max-w-md text-sm text-ink-muted">Nenhuma área cadastrada ainda. O seu agente cria as áreas; até lá, tudo aparece em Geral.</p>
      ) : null}

      {groups.map((group) => (
        <section key={group.kind} className="mt-14" aria-labelledby={`grupo-${group.kind}`}>
          <div className="flex items-baseline justify-between gap-4">
            <h2 id={`grupo-${group.kind}`} className="text-xs uppercase tracking-wider text-ink-muted">
              {AREA_KIND_LABELS[group.kind]}
            </h2>
            <p className="text-sm text-ink-faint">{group.areas.length}</p>
          </div>
          {group.kind === "outdoor" && outdoor_delay ? (
            <p className="mt-3 border-l-2 border-accent pl-3 text-sm text-ink-muted">{RAIN_NOTICE}</p>
          ) : null}
          <ul className="mt-6 grid gap-8 sm:grid-cols-2 md:grid-cols-3 md:gap-x-12 md:gap-y-10">
            {group.areas.map(({ subject: area, active_items, summary }) => (
              <SubjectCard
                key={area.id}
                compact
                href={`/casa/${area.slug}`}
                title={area.name}
                subtitle={active_items.length > 1 ? `${active_items.length} pendências` : null}
                next={active_items[0] ?? null}
                lines={lines(summary, today)}
              />
            ))}
          </ul>
        </section>
      ))}

      <section className="mt-14" aria-labelledby="grupo-geral">
        <h2 id="grupo-geral" className="text-xs uppercase tracking-wider text-ink-muted">Sem área</h2>
        <ul className="mt-6 grid gap-8 sm:grid-cols-2 md:grid-cols-3 md:gap-x-12">
          <SubjectCard
            compact
            href="/casa/geral"
            title="Geral"
            subtitle={general.active_items.length > 1 ? `${general.active_items.length} pendências` : null}
            next={general.active_items[0] ?? null}
            lines={general.summary.last_done_on ? [`Último registro ${daysAgoPhrase(general.summary.last_done_on, today)}`] : []}
          />
        </ul>
      </section>
    </main>
  );
}
