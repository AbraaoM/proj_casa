import { todayInTimeZone } from "@/lib/domain/dates";
import type { AgendaEvent } from "@/lib/domain/calendar";
import { zonedToOffsetIso } from "@/lib/domain/calendar";

export function agendaDayKey(event: AgendaEvent, timeZone: string): string {
  if (event.all_day) return event.starts_at.slice(0, 10);
  return todayInTimeZone(timeZone, new Date(event.starts_at));
}

export function agendaDayLabel(day: string, timeZone: string): string {
  const noon = new Date(zonedToOffsetIso(day, "12:00", timeZone));
  const label = new Intl.DateTimeFormat("pt-BR", { weekday: "long", day: "numeric", month: "long", timeZone }).format(noon);
  return label.charAt(0).toLocaleUpperCase("pt-BR") + label.slice(1);
}

export function agendaTimeLabel(event: AgendaEvent, timeZone: string): string {
  if (event.all_day) return "Dia inteiro";
  const format = new Intl.DateTimeFormat("pt-BR", { hour: "2-digit", minute: "2-digit", timeZone });
  const start = format.format(new Date(event.starts_at));
  if (!event.ends_at || event.ends_at === event.starts_at) return start;
  return `${start}–${format.format(new Date(event.ends_at))}`;
}
