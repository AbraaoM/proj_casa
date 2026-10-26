import Link from "next/link";
import { CircleAlert } from "lucide-react";
import { OneTapButtons } from "@/components/one-tap/one-tap-buttons";
import { EmptyNote } from "@/components/ui/attention-mark";
import type { RoutineStatus } from "@/lib/domain/routine";
import type { TapAction } from "@/lib/domain/one-tap";
import { doneByLabel, type RoutineView } from "@/lib/services/routines";
import { frequencyLabel, lastDoneLine, progressPercent, ROUTINE_STATUS_LABEL, statusPhrase } from "@/lib/ui/routine";

const DONE_NOW: TapAction[] = [{ kind: "done", label: "Feito agora", primary: true }];

const BAR: Record<RoutineStatus, string> = {
  overdue: "bg-soft-black dark:bg-white",
  never: "bg-ink-faint",
  due_soon: "bg-accent",
  ok: "bg-accent-dark/50 dark:bg-accent-light/50",
};

const MARKER: Record<RoutineStatus, string> = {
  overdue: "border-black dark:border-white",
  never: "border-ink-faint border-dashed",
  due_soon: "border-accent",
  ok: "border-transparent",
};

function StatusTag({ status }: { status: RoutineStatus }) {
  const tone =
    status === "overdue"
      ? "bg-soft-black text-white dark:bg-white dark:text-soft-black"
      : status === "due_soon"
        ? "bg-accent/15 text-accent-dark dark:text-accent-light"
        : status === "never"
          ? "border border-dashed border-ink-faint text-ink-muted"
          : "text-ink-muted";
  return (
    <span className={`inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${tone}`}>
      {status === "overdue" ? <CircleAlert aria-hidden className="h-3.5 w-3.5" strokeWidth={2} /> : null}
      {ROUTINE_STATUS_LABEL[status]}
    </span>
  );
}

/** One line of the checklist: what, how often, last time and by whom, how much of the interval is gone, Feito agora. */
export function RoutineItem({ routine, showArea = false }: { routine: RoutineView; showArea?: boolean }) {
  const { state } = routine;
  const by = routine.last ? doneByLabel(routine.last) : null;
  const label = routine.area_name ? `${routine.title} · ${routine.area_name}` : routine.title;
  const percent = progressPercent(state.progress);
  return (
    <li className={`border-l-2 py-1 pl-3 ${MARKER[state.status]}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-base leading-snug">
            {routine.title}
            {showArea && routine.area_name ? (
              <>
                {" "}
                {routine.area_slug ? (
                  <Link href={`/casa/${routine.area_slug}`} className="text-sm text-ink-muted underline-offset-4 hover:underline">
                    · {routine.area_name}
                  </Link>
                ) : (
                  <span className="text-sm text-ink-muted">· {routine.area_name}</span>
                )}
              </>
            ) : null}
          </p>
          <p className="mt-0.5 text-sm text-ink-muted">
            {frequencyLabel(routine)} · {statusPhrase(state)}
          </p>
        </div>
        <StatusTag status={state.status} />
      </div>
      <div
        className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-line dark:bg-line-dark"
        role="meter"
        aria-label={`Intervalo usado: ${routine.title}`}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={percent}
      >
        <div className={`h-full rounded-full ${BAR[state.status]}`} style={{ width: `${Math.max(percent, state.status === "never" ? 100 : 3)}%` }} />
      </div>
      <div className="mt-2 flex items-center justify-between gap-4">
        <p className="min-w-0 text-sm text-ink-muted">
          <span className="text-ink-faint">Última vez </span>
          {lastDoneLine(state.days_since, by)}
          {routine.last?.time && state.days_since === 0 ? ` às ${routine.last.time}` : ""}
        </p>
        <div className="shrink-0">
          <OneTapButtons id={routine.id} shown={routine.due_date} actions={DONE_NOW} label={label} />
        </div>
      </div>
    </li>
  );
}

export function RoutineList({
  routines,
  showArea = false,
  columns = false,
  empty,
}: {
  routines: RoutineView[];
  showArea?: boolean;
  /** Two columns from md up (area page). */
  columns?: boolean;
  empty: string;
}) {
  if (routines.length === 0) return <EmptyNote>{empty}</EmptyNote>;
  return (
    <ul className={`mt-5 ${columns ? "grid gap-6 md:grid-cols-2 md:gap-x-12" : "space-y-6"}`}>
      {routines.map((routine) => (
        <RoutineItem key={routine.id} routine={routine} showArea={showArea} />
      ))}
    </ul>
  );
}

/** Counts by status, e.g. "2 atrasadas · 1 sem registro · 5 em dia". */
export function statusSummary(routines: RoutineView[]): string {
  const count = (status: RoutineStatus) => routines.filter((routine) => routine.state.status === status).length;
  const parts = [
    [count("overdue"), "atrasada", "atrasadas"],
    [count("never"), "sem registro", "sem registro"],
    [count("due_soon"), "vence logo", "vencem logo"],
    [count("ok"), "em dia", "em dia"],
  ] as const;
  return parts
    .filter(([n]) => n > 0)
    .map(([n, one, many]) => `${n} ${n === 1 ? one : many}`)
    .join(" · ");
}
