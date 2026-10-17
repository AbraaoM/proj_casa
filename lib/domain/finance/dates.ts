import { isIsoDate } from "@/lib/domain/dates";

/** "2026-10" */
export function isMonth(value: string): boolean {
  return /^\d{4}-(0[1-9]|1[0-2])$/.test(value);
}

export function monthOf(date: string): string {
  return date.slice(0, 7);
}

export function daysInMonth(year: number, month1: number): number {
  return new Date(Date.UTC(year, month1, 0)).getUTCDate();
}

/** First and last day of a month, inclusive. */
export function monthRange(month: string): { from: string; to: string } {
  const [y, m] = month.split("-").map(Number) as [number, number];
  return { from: `${month}-01`, to: `${month}-${String(daysInMonth(y, m)).padStart(2, "0")}` };
}

export function shiftMonth(month: string, delta: number): string {
  const [y, m] = month.split("-").map(Number) as [number, number];
  const index = y * 12 + (m - 1) + delta;
  return `${Math.floor(index / 12)}-${String((index % 12) + 1).padStart(2, "0")}`;
}

/** A date on `day` of the given month, clamped to the month's last day (31 → 30 or 28/29). */
export function dateOnDay(month: string, day: number): string {
  const [y, m] = month.split("-").map(Number) as [number, number];
  const clamped = Math.min(day, daysInMonth(y, m));
  return `${month}-${String(clamped).padStart(2, "0")}`;
}

/** Adds whole months, keeping `anchorDay` (default: the date's own day) and clamping. */
export function addMonths(date: string, months: number, anchorDay?: number): string {
  if (!isIsoDate(date)) throw new Error(`Invalid date: ${date}`);
  const day = anchorDay ?? Number(date.slice(8, 10));
  return dateOnDay(shiftMonth(monthOf(date), months), day);
}
