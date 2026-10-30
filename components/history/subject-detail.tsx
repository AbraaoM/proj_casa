import type { ReactNode } from "react";
import { BackLink } from "@/components/history/back-link";
import { ActiveList } from "@/components/history/active-list";
import { CategoryChips } from "@/components/history/category-chips";
import { Timeline } from "@/components/history/timeline";
import { ListSearch } from "@/components/ui/list-search";
import type { AttentionItem, CareEvent } from "@/lib/domain/types";
import { categoryLabel } from "@/lib/ui/format";
import { matchesSearch } from "@/lib/ui/search";

/**
 * Shared layout of a subject page (dog, car, person, area).
 * Mobile: one column. Desktop: facts and pending on the left, history on the right.
 */
export function SubjectDetail({
  back,
  eyebrow,
  title,
  facts,
  stats,
  activeItems,
  events,
  basePath,
  category,
  query = "",
  notice,
  lead,
}: {
  back: { href: string; label: string };
  eyebrow: string;
  title: string;
  facts: Array<[string, string | null]>;
  stats?: ReactNode;
  activeItems: AttentionItem[];
  events: CareEvent[];
  basePath: string;
  category: string | null;
  /** ?q= — filters the lists on this page. Does not change what is stored. */
  query?: string;
  /** A short line under the header, e.g. the rain warning on outdoor areas. */
  notice?: string | null;
  /** A full-width block between the header and the columns (e.g. medication). */
  lead?: ReactNode;
}) {
  const searchedEvents = events.filter((event) =>
    matchesSearch(query, [event.title, categoryLabel(event.category), event.provider, event.notes, event.subject_name]),
  );
  const counts = new Map<string, number>();
  for (const event of searchedEvents) counts.set(event.category, (counts.get(event.category) ?? 0) + 1);
  const categories = [...counts.entries()]
    .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))
    .map(([slug, count]) => ({ slug, count }));
  const selected = category && counts.has(category) ? category : null;
  const visible = selected ? searchedEvents.filter((event) => event.category === selected) : searchedEvents;
  const pending = activeItems.filter((item) =>
    matchesSearch(query, [item.title, item.subject_name, item.notes, categoryLabel(item.category)]),
  );
  const shownFacts = facts.filter((fact): fact is [string, string] => Boolean(fact[1]));
  const nothing = query && events.length + activeItems.length > 0 && visible.length === 0 && pending.length === 0;
  const historyEmpty = query && events.length > 0 ? "Nada com essa busca." : undefined;

  return (
    <main className="mx-auto w-full max-w-3xl px-5 py-8 md:max-w-5xl md:px-10 md:py-12">
      <BackLink href={back.href} label={back.label} />
      <header className="mt-6">
        <p className="text-sm text-ink-muted">{eyebrow}</p>
        <h1 className="mt-1 break-words font-display text-5xl leading-none tracking-tight md:text-6xl">{title}</h1>
        {shownFacts.length > 0 ? (
          <dl className="mt-5 flex flex-wrap gap-x-6 gap-y-2 text-sm">
            {shownFacts.map(([label, value]) => (
              <div key={label} className="flex gap-2">
                <dt className="text-ink-muted">{label}</dt>
                <dd>{value}</dd>
              </div>
            ))}
          </dl>
        ) : null}
        {notice ? (
          <p className="mt-5 border-l-2 border-accent pl-3 text-sm text-ink-muted">{notice}</p>
        ) : null}
      </header>

      {events.length + activeItems.length > 0 ? (
        <ListSearch action={basePath} query={query} hidden={{ categoria: selected }} />
      ) : null}
      {nothing ? <p className="mt-6 text-sm text-ink-muted">Nada com essa busca.</p> : null}

      {lead}

      <div className="mt-10 grid grid-cols-1 gap-12 md:grid-cols-[minmax(0,2fr)_minmax(0,3fr)] md:gap-16">
        <div className="min-w-0 space-y-10">
          {stats ? <div className="grid grid-cols-2 gap-x-6 gap-y-6">{stats}</div> : null}
          <section className="border-t border-line pt-4 dark:border-line-dark">
            <div className="flex items-baseline justify-between gap-4">
              <h2 className="text-lg">Próximos</h2>
              <p className={pending.length > 0 ? "font-display text-2xl leading-none" : "text-sm text-ink-faint"}>
                {pending.length}
              </p>
            </div>
            <ActiveList items={pending} empty={query && activeItems.length > 0 ? "Nada com essa busca." : "Nada pendente"} />
          </section>
        </div>

        <section id="historico" className="min-w-0 border-t border-line pt-4 dark:border-line-dark">
          <div className="flex items-baseline justify-between gap-4">
            <h2 className="text-lg">Histórico</h2>
            <p className={events.length > 0 ? "font-display text-2xl leading-none" : "text-sm text-ink-faint"}>
              {visible.length}
            </p>
          </div>
          <CategoryChips basePath={basePath} categories={categories} active={selected} keep={{ q: query || null }} />
          <Timeline events={visible} emptyText={historyEmpty} />
        </section>
      </div>
    </main>
  );
}
