import type { RoutineState, RoutineStatus } from "@/lib/domain/routine";

/** Copy for the house checklist (painel and Telegram). Never names an agent: "seu agente". */
export const ROUTINE_STATUS_LABEL: Record<RoutineStatus, string> = {
  overdue: "Atrasada",
  never: "Sem registro",
  due_soon: "Vence logo",
  ok: "Em dia",
};

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

/** "todo dia", "a cada 3 dias", "toda semana", "todo mês", "a cada 6 meses". */
export function frequencyLabel(schedule: { interval_days: number | null; interval_months: number | null }): string {
  const { interval_days: days, interval_months: months } = schedule;
  if (days != null) {
    if (days === 1) return "todo dia";
    if (days === 7) return "toda semana";
    if (days % 7 === 0 && days <= 28) return `a cada ${days / 7} semanas`;
    return `a cada ${days} dias`;
  }
  if (months != null) return months === 1 ? "todo mês" : `a cada ${months} meses`;
  return "sem frequência";
}

/** "hoje", "ontem", "há 5 dias", or "nunca registrada". */
export function sinceLabel(daysSince: number | null): string {
  if (daysSince === null) return "nunca registrada";
  if (daysSince <= 0) return "hoje";
  if (daysSince === 1) return "ontem";
  return `há ${daysSince} dias`;
}

/** What the status means right now: "atrasada há 2 dias", "vence hoje", "em dia". */
export function statusPhrase(state: Pick<RoutineState, "status" | "days_overdue" | "days_until_due">): string {
  if (state.status === "overdue") return `atrasada há ${plural(state.days_overdue, "dia", "dias")}`;
  if (state.status === "never") return "sem registro";
  if (state.days_until_due <= 0) return "vence hoje";
  if (state.days_until_due === 1) return "vence amanhã";
  if (state.status === "due_soon") return `vence em ${state.days_until_due} dias`;
  return "em dia";
}

/** The "last time" line: "há 5 dias · pessoa_a" or "nunca registrada". */
export function lastDoneLine(daysSince: number | null, by: string | null): string {
  const since = sinceLabel(daysSince);
  return by && daysSince !== null ? `${since} · ${by}` : since;
}

/** Progress bar width, 0–100. */
export function progressPercent(progress: number): number {
  return Math.round(Math.min(1, Math.max(0, progress)) * 100);
}
