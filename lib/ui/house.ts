import type { HistorySummary } from "@/lib/domain/history";
import type { AreaKind } from "@/lib/domain/types";

export const AREA_KIND_LABELS: Record<AreaKind, string> = {
  room: "Cômodos",
  outdoor: "Área externa",
  system: "Sistemas",
};

export const AREA_KIND_SINGULAR: Record<AreaKind, string> = {
  room: "Cômodo",
  outdoor: "Área externa",
  system: "Sistema",
};

export const RAIN_NOTICE = "Chuva prevista hoje. Tarefas externas podem esperar.";

/** The most recent of cleaning and deep_clean. */
export function lastCleaning(summary: HistorySummary) {
  const candidates = [summary.last_by_category.cleaning, summary.last_by_category.deep_clean].filter(
    (entry): entry is NonNullable<typeof entry> => Boolean(entry),
  );
  return candidates.sort((left, right) => (left.done_on < right.done_on ? 1 : -1))[0] ?? null;
}
