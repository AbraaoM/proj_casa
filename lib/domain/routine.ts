import { addDays, daysUntil } from "@/lib/domain/dates";
import { addMonths } from "@/lib/domain/finance/dates";
import { PRIORITY_RANK } from "@/lib/domain/attention";
import type { Domain, ItemStatus, Priority } from "@/lib/domain/types";

/**
 * House routines, the checklist on /casa: a house item that repeats every N days or months.
 * Like a hospital cleaning sheet, each one shows when it was last done, by whom, and how much
 * of its interval is used up, so the most urgent come first. Pure functions, no I/O.
 */
export type RoutineStatus = "overdue" | "never" | "due_soon" | "ok";

/** Share of the interval used from which a routine counts as "vence logo". */
export const DUE_SOON_SHARE = 0.75;

export const ROUTINE_STATUS_RANK: Record<RoutineStatus, number> = { overdue: 0, never: 1, due_soon: 2, ok: 3 };

export const ROUTINE_STATUSES: readonly RoutineStatus[] = ["overdue", "never", "due_soon", "ok"];

type Schedule = { interval_days: number | null; interval_months: number | null };

export type RoutineInput = Schedule & {
  id: string;
  title: string;
  priority: Priority;
  due_date: string | null;
  last_done_on: string | null;
  area_name: string | null;
};

export type RoutineState = {
  status: RoutineStatus;
  /** The interval in days (months counted from the last time). */
  interval_days: number;
  /** The effective due date: the stored one, or derived when it is missing. */
  due_date: string;
  days_until_due: number;
  days_overdue: number;
  /** Days since the last time, null when never done. */
  days_since: number | null;
  /** Share of the interval used: 0 just done, 1 due today, above 1 late. */
  progress: number;
};

export function isRoutine(item: { domain: Domain; interval_days: number | null; interval_months: number | null; interval_hours?: number | null }): boolean {
  return item.domain === "house" && item.interval_hours == null && (item.interval_days != null || item.interval_months != null);
}

export function intervalInDays(item: Schedule & { last_done_on: string | null }, today: string): number {
  if (item.interval_days != null) return item.interval_days;
  const base = item.last_done_on ?? today;
  return daysUntil(addMonths(base, item.interval_months ?? 1), base);
}

function nextDue(from: string, item: Schedule): string {
  if (item.interval_days != null) return addDays(from, item.interval_days);
  return addMonths(from, item.interval_months ?? 1);
}

export function routineState(item: RoutineInput, today: string): RoutineState {
  const interval = Math.max(1, intervalInDays(item, today));
  const due = item.due_date ?? (item.last_done_on ? nextDue(item.last_done_on, item) : today);
  const untilDue = daysUntil(due, today);
  const since = item.last_done_on ? daysUntil(today, item.last_done_on) : null;
  const progress = item.last_done_on ? (interval - untilDue) / interval : Math.max(1, (interval - untilDue) / interval);
  let status: RoutineStatus;
  if (untilDue < 0) status = "overdue";
  else if (!item.last_done_on) status = "never";
  else if (untilDue <= 1 || progress >= DUE_SOON_SHARE) status = "due_soon";
  else status = "ok";
  return {
    status,
    interval_days: interval,
    due_date: due,
    days_until_due: untilDue,
    days_overdue: Math.max(0, -untilDue),
    days_since: since,
    progress,
  };
}

export type WithState<T> = T & { state: RoutineState };

/** Most urgent first: atrasada, sem registro, vence logo, em dia; then the most consumed interval. */
export function sortRoutines<T extends RoutineInput>(items: T[], today: string): WithState<T>[] {
  return items
    .map((item) => ({ ...item, state: routineState(item, today) }))
    .sort(
      (a, b) =>
        ROUTINE_STATUS_RANK[a.state.status] - ROUTINE_STATUS_RANK[b.state.status] ||
        b.state.progress - a.state.progress ||
        PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority] ||
        (a.area_name ?? "").localeCompare(b.area_name ?? "", "pt-BR") ||
        a.title.localeCompare(b.title, "pt-BR"),
    );
}

/** Due date for a new routine: one interval after the last time, or today when never done. */
export function initialRoutineDue(item: Schedule & { last_done_on: string | null }, today: string): string {
  return item.last_done_on ? nextDue(item.last_done_on, item) : today;
}

type EditCurrent = Schedule & {
  domain: Domain;
  status: ItemStatus;
  due_date: string | null;
  last_done_on: string | null;
  interval_hours: number | null;
};

/**
 * When an agent changes a routine's frequency (or its last time) without sending a due date,
 * the due date follows: last time + new interval. undefined means "leave the due date alone".
 */
export function dueAfterEdit(current: EditCurrent, patch: Record<string, unknown>, today: string): string | undefined {
  if (current.domain !== "house" || "due_date" in patch) return undefined;
  const touched = "interval_days" in patch || "interval_months" in patch || "last_done_on" in patch;
  if (!touched) return undefined;
  const pick = <K extends "interval_days" | "interval_months" | "interval_hours" | "last_done_on">(key: K) =>
    (key in patch && patch[key] !== undefined ? patch[key] : current[key]) as EditCurrent[K];
  const next = { interval_days: pick("interval_days"), interval_months: pick("interval_months"), interval_hours: pick("interval_hours") };
  if (next.interval_hours != null || (next.interval_days == null && next.interval_months == null)) return undefined;
  return initialRoutineDue({ ...next, last_done_on: pick("last_done_on") }, today);
}

export type SheetEvent = { care_item_id: string; done_on: string; by: string; time: string | null; notes: string | null };
export type SheetMark = Omit<SheetEvent, "care_item_id" | "done_on">;
export type Sheet = {
  days: string[];
  rows: { id: string; title: string; cells: { day: string; marks: SheetMark[] }[] }[];
};

/** The "folha de registro": task × day, oldest day first, today last. */
export function buildSheet(input: { routines: { id: string; title: string }[]; events: SheetEvent[]; today: string; days: number }): Sheet {
  const days = Array.from({ length: input.days }, (_, index) => addDays(input.today, index - input.days + 1));
  const byKey = new Map<string, SheetMark[]>();
  for (const event of input.events) {
    const key = `${event.care_item_id}|${event.done_on}`;
    const marks = byKey.get(key) ?? [];
    marks.push({ by: event.by, time: event.time, notes: event.notes });
    byKey.set(key, marks);
  }
  return {
    days,
    rows: input.routines.map((routine) => ({
      id: routine.id,
      title: routine.title,
      cells: days.map((day) => ({ day, marks: byKey.get(`${routine.id}|${day}`) ?? [] })),
    })),
  };
}
