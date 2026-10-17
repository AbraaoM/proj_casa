import { groupByMonth } from "@/lib/domain/history";
import { localTime } from "@/lib/domain/doses";
import { DEFAULT_TIMEZONE, type CareEvent } from "@/lib/domain/types";
import { categoryUnlessTitle, dayAndMonth, formatKg, formatKm, formatMoney } from "@/lib/ui/format";

export function Timeline({
  events,
  showSubject = false,
  emptyText = "Nenhum registro ainda. O James preenche isso.",
  timeZone = DEFAULT_TIMEZONE,
}: {
  events: CareEvent[];
  showSubject?: boolean;
  emptyText?: string;
  /** Zone for the time of events that carry done_at (doses). */
  timeZone?: string;
}) {
  if (events.length === 0) return <p className="mt-6 text-sm text-ink-muted">{emptyText}</p>;
  const groups = groupByMonth(events);
  return (
    <div className="mt-6 space-y-8">
      {groups.map((group) => (
        <section key={group.key} aria-label={group.label}>
          <h3 className="text-xs uppercase tracking-wider text-ink-muted">{group.label}</h3>
          <ol className="mt-3">
            {group.events.map((event) => {
              const { day, month } = dayAndMonth(event.done_on);
              const metrics = [
                event.weight_kg !== null ? formatKg(event.weight_kg) : null,
                event.odometer_km !== null ? formatKm(event.odometer_km) : null,
              ].filter(Boolean);
              return (
                <li
                  key={event.id}
                  className="grid grid-cols-[3rem_1fr_auto] gap-x-3 border-t border-line py-4 first:border-t-0 dark:border-line-dark"
                >
                  <p className="leading-none">
                    <span className="block font-display text-2xl">{day}</span>
                    <span className="mt-1 block text-xs text-ink-muted">{month}</span>
                  </p>
                  <div className="min-w-0">
                    <p className="text-base">
                      {event.title}
                      {showSubject && event.subject_name ? (
                        <span className="text-ink-muted"> · {event.subject_name}</span>
                      ) : null}
                    </p>
                    {(() => {
                      const parts = [
                        event.done_at ? localTime(event.done_at, timeZone) : null,
                        categoryUnlessTitle(event.category, event.title),
                        event.provider,
                        ...metrics,
                      ].filter(Boolean);
                      return parts.length > 0 ? <p className="mt-1 text-sm text-ink-muted">{parts.join(" · ")}</p> : null;
                    })()}
                    {event.notes ? (
                      <p className="mt-2 whitespace-pre-line text-sm text-ink-muted">{event.notes}</p>
                    ) : null}
                  </div>
                  <p className="text-right text-sm tabular-nums">
                    {event.amount_cents !== null ? formatMoney(event.amount_cents) : ""}
                  </p>
                </li>
              );
            })}
          </ol>
        </section>
      ))}
    </div>
  );
}
