import type { Sql } from "@/lib/db/client";
import { addDays } from "@/lib/domain/dates";
import { buildSheet, sortRoutines, type RoutineStatus, type Sheet, type WithState } from "@/lib/domain/routine";
import { listRoutineRows, listSheetEvents, type RoutineRow } from "@/lib/repositories/routines";

export type RoutineView = WithState<RoutineRow>;

export type RoutineQuery = { area: string | null; status: RoutineStatus | null; limit: number | null };

/** House routines, most urgent first. */
export async function listRoutines(sql: Sql, input: RoutineQuery & { today: string; timeZone: string }): Promise<RoutineView[]> {
  const rows = await listRoutineRows(sql, { timeZone: input.timeZone, area: input.area });
  let sorted = sortRoutines(rows, input.today);
  if (input.status) sorted = sorted.filter((routine) => routine.state.status === input.status);
  return input.limit ? sorted.slice(0, input.limit) : sorted;
}

/** Display name of whoever did it: the username, or "seu agente" for an agent key with no person. */
export function doneByLabel(entry: { by: string | null; via_agent: boolean }): string {
  return entry.by ?? (entry.via_agent ? "seu agente" : "alguém");
}

/** The folha de registro of the given routines for the last `days` days. */
export async function loadSheet(sql: Sql, input: { routines: { id: string; title: string }[]; today: string; days: number; timeZone: string }): Promise<Sheet> {
  const events = await listSheetEvents(sql, {
    itemIds: input.routines.map((routine) => routine.id),
    from: addDays(input.today, -(input.days - 1)),
    timeZone: input.timeZone,
  });
  return buildSheet({
    routines: input.routines,
    events: events.map((event) => ({ ...event, by: doneByLabel(event) })),
    today: input.today,
    days: input.days,
  });
}

/** One house routine for the agent: the checklist line plus who did it last. */
export function compactRoutine(routine: RoutineView) {
  return {
    id: routine.id,
    title: routine.title,
    area: routine.area_slug,
    area_name: routine.area_name,
    interval_days: routine.interval_days,
    interval_months: routine.interval_months,
    last_done_on: routine.last_done_on,
    done_by: routine.last ? doneByLabel(routine.last) : null,
    via_agent: routine.last?.via_agent ?? false,
    days_since: routine.state.days_since,
    progress_pct: Math.round(routine.state.progress * 100),
    status: routine.state.status,
    due_date: routine.state.due_date,
    days_overdue: routine.state.days_overdue,
    last_notes: routine.last?.notes ?? null,
  };
}
