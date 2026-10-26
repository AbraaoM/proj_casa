import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { BackLink } from "@/components/history/back-link";
import { PageNotice } from "@/components/history/page-notice";
import { SubjectCard } from "@/components/history/subject-card";
import { RoutineList, statusSummary } from "@/components/house/checklist";
import type { HistorySummary } from "@/lib/domain/history";
import type { RoutineView } from "@/lib/services/routines";
import { loadHouseOverview } from "@/lib/services/subject-pages";
import { daysAgoPhrase } from "@/lib/ui/format";
import { AREA_KIND_LABELS, lastCleaning, RAIN_NOTICE } from "@/lib/ui/house";

export const dynamic = "force-dynamic";

/** How many routines "Mais urgentes" shows. */
const URGENT_LIMIT = 5;

function lines(summary: HistorySummary, today: string): string[] {
  const cleaning = lastCleaning(summary);
  const repair = summary.last_by_category.repair;
  return [
    cleaning ? `Limpeza ${daysAgoPhrase(cleaning.done_on, today)}` : null,
    repair ? `Reparo ${daysAgoPhrase(repair.done_on, today)}` : null,
  ].filter((line): line is string => line !== null);
}

type Block = { key: string; title: string; href: string | null; routines: RoutineView[] };

/** The checklist by area, in the order of the area list; routines without an area go last. */
function blocksOf(routines: RoutineView[], order: Array<{ id: string; slug: string; name: string }>): Block[] {
  const blocks: Block[] = order
    .map((area) => ({ key: area.id, title: area.name, href: `/casa/${area.slug}`, routines: routines.filter((routine) => routine.area_id === area.id) }))
    .filter((block) => block.routines.length > 0);
  const loose = routines.filter((routine) => !routine.area_id || !order.some((area) => area.id === routine.area_id));
  if (loose.length > 0) blocks.push({ key: "geral", title: "Sem área", href: "/casa/geral", routines: loose });
  return blocks;
}

export default async function HousePage() {
  const page = await loadHouseOverview();
  if (page.status !== "ready") return <PageNotice status={page.status} />;
  const { today, data } = page;
  const { groups, general, outdoor_delay, routines } = data;
  const hasAreas = groups.length > 0;
  const routineIds = new Set(routines.map((routine) => routine.id));
  const urgent = routines.filter((routine) => routine.state.status !== "ok").slice(0, URGENT_LIMIT);
  const blocks = blocksOf(routines, groups.flatMap((group) => group.areas.map((area) => area.subject)));
  const pending = (items: typeof general.active_items) => items.filter((item) => !routineIds.has(item.id));
  const generalPending = pending(general.active_items);

  return (
    <main className="mx-auto w-full max-w-3xl px-5 py-8 md:max-w-5xl md:px-10 md:py-12">
      <BackLink href="/" label="Painel" />
      <h1 className="mt-6 font-display text-5xl leading-none tracking-tight md:text-6xl">Casa</h1>
      <p className="mt-3 max-w-md text-base text-ink-muted">
        O checklist da casa: quando cada tarefa foi feita, por quem, e o que está mais urgente.
      </p>
      {routines.length > 0 ? <p className="mt-2 text-sm text-ink-faint">{statusSummary(routines)}</p> : null}

      {routines.length === 0 ? (
        <p className="mt-8 max-w-md border-l-2 border-accent pl-3 text-sm text-ink-muted">
          Nenhuma rotina ainda. Peça ao seu agente para montar o checklist da casa: ele sugere a frequência de cada tarefa e você ajusta conversando.
        </p>
      ) : (
        <section className="mt-12" aria-labelledby="urgentes">
          <div className="flex items-baseline justify-between gap-4">
            <h2 id="urgentes" className="text-xs uppercase tracking-wider text-ink-muted">Mais urgentes</h2>
            <p className="text-sm text-ink-faint">{urgent.length}</p>
          </div>
          <div className="md:max-w-2xl">
            <RoutineList routines={urgent} showArea empty="Tudo em dia. Nada pedindo limpeza agora." />
          </div>
        </section>
      )}

      {blocks.length > 0 ? (
        <section className="mt-14" aria-labelledby="checklist">
          <h2 id="checklist" className="text-xs uppercase tracking-wider text-ink-muted">Checklist por área</h2>
          <div className="mt-6 grid gap-12 md:grid-cols-2 md:gap-x-12">
            {blocks.map((block) => (
              <div key={block.key} className="min-w-0 border-t border-line pt-4 dark:border-line-dark">
                {block.href ? (
                  <Link href={block.href} className="group flex min-h-11 items-baseline justify-between gap-4 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-accent">
                    <h3 className="font-display text-2xl leading-tight tracking-tight transition-colors duration-300 group-hover:text-accent-dark dark:group-hover:text-accent-light">
                      {block.title}
                    </h3>
                    <span className="flex items-center gap-1 text-sm text-ink-muted">
                      Folha
                      <ChevronRight aria-hidden className="h-4 w-4 text-ink-faint" strokeWidth={1.75} />
                    </span>
                  </Link>
                ) : (
                  <h3 className="font-display text-2xl leading-tight tracking-tight">{block.title}</h3>
                )}
                <RoutineList routines={block.routines} empty="Sem rotinas." />
              </div>
            ))}
          </div>
          <p className="mt-10 max-w-md text-sm text-ink-faint">As frequências são ajustadas conversando com seu agente.</p>
        </section>
      ) : null}

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
            {group.areas.map(({ subject: area, active_items, summary }) => {
              const others = pending(active_items);
              return (
                <SubjectCard
                  key={area.id}
                  compact
                  href={`/casa/${area.slug}`}
                  title={area.name}
                  subtitle={others.length > 1 ? `${others.length} pendências` : null}
                  next={others[0] ?? null}
                  lines={lines(summary, today)}
                />
              );
            })}
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
            subtitle={generalPending.length > 1 ? `${generalPending.length} pendências` : null}
            next={generalPending[0] ?? null}
            lines={general.summary.last_done_on ? [`Último registro ${daysAgoPhrase(general.summary.last_done_on, today)}`] : []}
          />
        </ul>
      </section>
    </main>
  );
}
