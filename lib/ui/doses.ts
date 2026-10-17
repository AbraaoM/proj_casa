import { addDays } from "@/lib/domain/dates";
import { formatDate } from "@/lib/ui/format";

/** 140 -> "em 2h20", 40 -> "em 40 min", -20 -> "há 20 min". */
export function untilPhrase(minutes: number): string {
  const late = minutes < 0;
  const abs = Math.abs(minutes);
  const hours = Math.floor(abs / 60);
  const rest = abs % 60;
  const text = hours === 0 ? `${rest} min` : rest === 0 ? `${hours} h` : `${hours}h${String(rest).padStart(2, "0")}`;
  if (abs === 0) return "agora";
  return late ? `há ${text}` : `em ${text}`;
}

/** "hoje", "ontem", "amanhã" or "16 out". */
export function dayWord(day: string, today: string): string {
  if (day === today) return "hoje";
  if (day === addDays(today, -1)) return "ontem";
  if (day === addDays(today, 1)) return "amanhã";
  return formatDate(day).replace(/ \d{4}$/, "");
}

/** "a cada 6 h", "1x ao dia". */
export function intervalPhrase(hours: number): string {
  if (hours === 24) return "1x ao dia";
  if (hours % 24 === 0) return `a cada ${hours / 24} dias`;
  return `a cada ${hours} h`;
}
