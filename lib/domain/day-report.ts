import { isIsoDate } from "@/lib/domain/dates";
import type { FieldError } from "@/lib/errors";

export const DAY_KINDS = ["checklist", "task", "payment"] as const;
export type DayKind = (typeof DAY_KINDS)[number];

/** One thing someone recorded on a calendar day. */
export type DayDeed = {
  id: string;
  kind: DayKind;
  title: string;
  /** Area, subject, or the amount. Null when there is nothing to add. */
  detail: string | null;
  /** Username, "seu agente", or "alguém". */
  by: string;
  /** "HH:mm" in the house time zone, when the record was made that same day. */
  at: string | null;
};

export type DayPerson = { name: string; deeds: DayDeed[] };

export type DayCounts = Record<DayKind, number>;

export type DayReport = {
  date: string;
  counts: DayCounts;
  people: DayPerson[];
};

export type DayDeedSource = {
  id: string;
  kind: DayKind;
  title: string;
  detail: string | null;
  amount_cents: number | null;
  by: string;
  at: string | null;
};

const TAIL = new Set(["seu agente", "alguém"]);

/** A day the report can show: today when omitted, never a future day. */
export function parseReportDay(
  value: unknown,
  today: string,
): { ok: true; value: string } | { ok: false; details: FieldError[] } {
  if (value === undefined || value === null || value === "") return { ok: true, value: today };
  if (typeof value !== "string" || !isIsoDate(value)) {
    return { ok: false, details: [{ field: "date", message: "must be YYYY-MM-DD" }] };
  }
  if (value > today) return { ok: false, details: [{ field: "date", message: "is in the future" }] };
  return { ok: true, value };
}

export function dayCounts(deeds: Array<{ kind: DayKind }>): DayCounts {
  const counts: DayCounts = { checklist: 0, task: 0, payment: 0 };
  for (const deed of deeds) counts[deed.kind] += 1;
  return counts;
}

/** People in name order, with whoever has no account last. Inside, earliest time first. */
export function groupDay(deeds: DayDeed[]): DayPerson[] {
  const byName = new Map<string, DayDeed[]>();
  for (const deed of deeds) {
    const list = byName.get(deed.by) ?? [];
    list.push(deed);
    byName.set(deed.by, list);
  }
  return [...byName.entries()]
    .sort((left, right) => {
      const tail = Number(TAIL.has(left[0])) - Number(TAIL.has(right[0]));
      return tail !== 0 ? tail : left[0].localeCompare(right[0], "pt-BR");
    })
    .map(([name, list]) => ({
      name,
      deeds: [...list].sort((left, right) => (left.at ?? "99:99").localeCompare(right.at ?? "99:99") || left.title.localeCompare(right.title, "pt-BR")),
    }));
}

/** Most recent first, for the short list on the panel. Undated lines go last. */
export function previewDeeds(people: DayPerson[], limit: number): DayDeed[] {
  return people
    .flatMap((person) => person.deeds)
    .sort((left, right) => (right.at ?? "").localeCompare(left.at ?? "") || left.title.localeCompare(right.title, "pt-BR"))
    .slice(0, limit);
}
