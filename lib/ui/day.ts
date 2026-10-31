import { addDays } from "@/lib/domain/dates";
import type { DayCounts, DayDeed, DayDeedSource, DayKind, DayPerson } from "@/lib/domain/day-report";
import { formatMoney } from "@/lib/ui/format";

export const DAY_KIND_LABEL: Record<DayKind, string> = {
  checklist: "Checklist",
  task: "Tarefa",
  payment: "Pagamento",
};

const MONTHS = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];

/** Folds the amount into the detail. A payment shows only the money, so it is not also a task. */
export function presentDeed(source: DayDeedSource): DayDeed {
  const money = source.amount_cents !== null ? formatMoney(source.amount_cents) : null;
  const detail = source.kind === "payment" ? money : [source.detail, money].filter((part): part is string => Boolean(part)).join(" · ") || null;
  return { id: source.id, kind: source.kind, title: source.title, detail, by: source.by, at: source.at };
}

/** How many lines the evening message lists before it says "e mais". */
export const EVENING_MAX_LINES = 24;

/** "Hoje", "Ontem", or "31 out". */
export function dayHeading(iso: string, today: string): string {
  if (iso === today) return "Hoje";
  if (iso === addDays(today, -1)) return "Ontem";
  const month = Number(iso.slice(5, 7));
  return `${Number(iso.slice(8, 10))} ${MONTHS[month - 1] ?? ""}`.trim();
}

/** "2 tarefas · 1 pagamento · 3 no checklist". Empty when nothing was recorded. */
export function daySummary(counts: DayCounts): string {
  const part = (count: number, one: string, many: string) => (count === 0 ? null : count === 1 ? `1 ${one}` : `${count} ${many}`);
  return [part(counts.task, "tarefa", "tarefas"), part(counts.payment, "pagamento", "pagamentos"), part(counts.checklist, "no checklist", "no checklist")]
    .filter((line): line is string => line !== null)
    .join(" · ");
}

function line(deed: DayDeed): string {
  const bits = [DAY_KIND_LABEL[deed.kind], deed.title, deed.detail, deed.at].filter((part): part is string => Boolean(part));
  return `• ${bits.join(" · ")}`;
}

/**
 * The message the connected agents send when the day closes.
 * Same facts as /hoje, capped so a long checklist still fits in one Telegram message.
 */
export function buildEveningReport(people: DayPerson[], maxLines = EVENING_MAX_LINES): string {
  const total = people.reduce((sum, person) => sum + person.deeds.length, 0);
  if (total === 0) return "Fechando o dia. Ninguém registrou tarefa, pagamento ou checklist.";
  const parts = ["Fechando o dia. Quem fez o quê:"];
  let budget = maxLines;
  let hidden = 0;
  for (const person of people) {
    if (budget <= 0) {
      hidden += person.deeds.length;
      continue;
    }
    parts.push("", person.name);
    for (const deed of person.deeds) {
      if (budget <= 0) {
        hidden += 1;
        continue;
      }
      parts.push(line(deed));
      budget -= 1;
    }
  }
  if (hidden > 0) parts.push(`• e mais ${hidden}`);
  parts.push("", "O mesmo relatório está em Hoje, no app.");
  return parts.join("\n");
}
