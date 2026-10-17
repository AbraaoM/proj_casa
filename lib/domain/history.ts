import { daysUntil } from "@/lib/domain/dates";

/** The fields of an event that the history summary reads. */
export type HistoryEvent = {
  id: string;
  category: string;
  title: string;
  done_on: string;
  weight_kg: number | null;
  odometer_km: number | null;
  amount_cents: number | null;
  voided_at: string | null;
  created_at: string;
};

export type LastByCategory = {
  event_id: string;
  done_on: string;
  title: string;
  days_since: number;
};

export type HistorySummary = {
  events_count: number;
  last_done_on: string | null;
  last_by_category: Record<string, LastByCategory>;
  /** Oldest first, one point per event with a weight. */
  weight_series: Array<{ done_on: string; weight_kg: number }>;
  costs: {
    year: number;
    year_total_cents: number;
    all_time_cents: number;
    year_by_category: Record<string, number>;
  };
  /** Last oil change. km_since needs the vehicle's current odometer. */
  oil: { done_on: string; days_since: number; odometer_km: number | null; km_since: number | null } | null;
};

export const OIL_CATEGORY = "oil";

/** Newest first: done_on, then created_at, then id. Stable for equal days. */
export function compareNewestFirst(left: HistoryEvent, right: HistoryEvent): number {
  if (left.done_on !== right.done_on) return left.done_on < right.done_on ? 1 : -1;
  if (left.created_at !== right.created_at) return left.created_at < right.created_at ? 1 : -1;
  return left.id < right.id ? 1 : left.id > right.id ? -1 : 0;
}

export function summarizeHistory(
  events: readonly HistoryEvent[],
  context: { today: string; odometer_km?: number | null },
): HistorySummary {
  const live = events.filter((event) => event.voided_at === null).sort(compareNewestFirst);
  const year = Number(context.today.slice(0, 4));

  const last_by_category: Record<string, LastByCategory> = {};
  const year_by_category: Record<string, number> = {};
  let year_total_cents = 0;
  let all_time_cents = 0;

  for (const event of live) {
    if (!last_by_category[event.category]) {
      last_by_category[event.category] = {
        event_id: event.id,
        done_on: event.done_on,
        title: event.title,
        days_since: Math.max(0, -daysUntil(event.done_on, context.today)),
      };
    }
    if (event.amount_cents !== null) {
      all_time_cents += event.amount_cents;
      if (Number(event.done_on.slice(0, 4)) === year) {
        year_total_cents += event.amount_cents;
        year_by_category[event.category] = (year_by_category[event.category] ?? 0) + event.amount_cents;
      }
    }
  }

  const weight_series = live
    .filter((event) => event.weight_kg !== null)
    .map((event) => ({ done_on: event.done_on, weight_kg: event.weight_kg as number }))
    .reverse();

  const oilEvent = live.find((event) => event.category === OIL_CATEGORY) ?? null;
  const odometer = context.odometer_km ?? null;
  const oil = oilEvent
    ? {
        done_on: oilEvent.done_on,
        days_since: Math.max(0, -daysUntil(oilEvent.done_on, context.today)),
        odometer_km: oilEvent.odometer_km,
        km_since:
          oilEvent.odometer_km !== null && odometer !== null && odometer >= oilEvent.odometer_km
            ? odometer - oilEvent.odometer_km
            : null,
      }
    : null;

  return {
    events_count: live.length,
    last_done_on: live[0]?.done_on ?? null,
    last_by_category,
    weight_series,
    costs: { year, year_total_cents, all_time_cents, year_by_category },
    oil,
  };
}

const MONTHS_PT = [
  "janeiro",
  "fevereiro",
  "março",
  "abril",
  "maio",
  "junho",
  "julho",
  "agosto",
  "setembro",
  "outubro",
  "novembro",
  "dezembro",
];

export type TimelineGroup<T> = { key: string; label: string; events: T[] };

/** Groups events by calendar month (YYYY-MM of done_on), newest month first. */
export function groupByMonth<T extends HistoryEvent>(events: readonly T[]): Array<TimelineGroup<T>> {
  const groups = new Map<string, T[]>();
  for (const event of [...events].sort(compareNewestFirst)) {
    const key = event.done_on.slice(0, 7);
    const list = groups.get(key);
    if (list) list.push(event);
    else groups.set(key, [event]);
  }
  return [...groups.entries()].map(([key, list]) => ({ key, label: monthLabel(key), events: list }));
}

export function monthLabel(key: string): string {
  const [year, month] = key.split("-").map(Number);
  const name = MONTHS_PT[(month ?? 1) - 1] ?? key;
  return `${name} de ${year}`;
}

/**
 * A measurement (weight) only replaces the subject's current value when no other
 * live measurement is newer. Same day counts as newer, so the latest write wins.
 */
export function isNewestMeasurement(doneOn: string, newestExisting: string | null): boolean {
  return newestExisting === null || doneOn >= newestExisting;
}
