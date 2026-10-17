import { isIsoDate } from "@/lib/domain/dates";
import type { FieldError, ParseResult } from "@/lib/domain/validate";
import type { ItemStatus } from "@/lib/domain/types";

/** How far into the future a dose time may be (clock drift between James and the server). */
export const FUTURE_TOLERANCE_MS = 5 * 60_000;

/** POST /api/agent/items/:id/doses */
export type DoseInput = {
  /** ISO time. Without an offset it is read in the household time zone. null = now. */
  given_at: string | null;
  notes: string | null;
  external_key: string | null;
};

const DOSE_FIELDS = new Set(["given_at", "notes", "external_key"]);
const LOCAL_TIME = /^(\d{4}-\d{2}-\d{2})[T ](\d{2}):(\d{2})(?::(\d{2})(?:\.\d{1,6})?)?$/;
const OFFSET_TIME = /^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}(?::\d{2}(?:\.\d{1,6})?)?(?:Z|[+-]\d{2}:?\d{2})$/;

export function parseDoseBody(body: unknown): ParseResult<DoseInput> {
  if (body === null || typeof body !== "object" || Array.isArray(body)) {
    return { ok: false, details: [{ field: "body", message: "must be a JSON object" }] };
  }
  const record = body as Record<string, unknown>;
  const details: FieldError[] = Object.keys(record)
    .filter((key) => !DOSE_FIELDS.has(key))
    .map((field) => ({ field, message: "is not a known field" }));

  let given_at: string | null = null;
  const rawGiven = record.given_at;
  if (rawGiven !== undefined && rawGiven !== null) {
    if (typeof rawGiven !== "string" || (!LOCAL_TIME.test(rawGiven) && !OFFSET_TIME.test(rawGiven))) {
      details.push({ field: "given_at", message: "must be an ISO date-time like 2026-10-17T07:30 or 2026-10-17T07:30:00-03:00" });
    } else {
      given_at = rawGiven;
    }
  }

  let notes: string | null = null;
  if (record.notes !== undefined && record.notes !== null) {
    if (typeof record.notes !== "string" || record.notes.length > 2000) {
      details.push({ field: "notes", message: "must be a string up to 2000 characters" });
    } else {
      notes = record.notes.trim() || null;
    }
  }

  let external_key: string | null = null;
  if (record.external_key !== undefined && record.external_key !== null) {
    const key = record.external_key;
    if (typeof key !== "string" || key.trim().length === 0 || key.length > 200) {
      details.push({ field: "external_key", message: "must be a non-empty string up to 200 characters" });
    } else {
      external_key = key.trim();
    }
  }

  if (details.length > 0) return { ok: false, details };
  return { ok: true, value: { given_at, notes, external_key } };
}

/**
 * Turns a dose time into an absolute instant (ISO, UTC).
 * Returns null when the text is not a valid time.
 */
export function resolveGivenAt(raw: string | null, timeZone: string, now: Date): string | null {
  if (raw === null) return new Date(Math.floor(now.getTime() / 60_000) * 60_000).toISOString();
  if (OFFSET_TIME.test(raw)) {
    const normalized = raw.replace(" ", "T").replace(/([+-]\d{2})(\d{2})$/, "$1:$2");
    const date = new Date(normalized);
    return Number.isNaN(date.getTime()) ? null : date.toISOString();
  }
  const match = LOCAL_TIME.exec(raw);
  if (!match) return null;
  const [, day, hour, minute, second] = match;
  if (!day || !isIsoDate(day) || Number(hour) > 23 || Number(minute) > 59 || Number(second ?? 0) > 59) return null;
  return zonedToUtc(day, Number(hour), Number(minute), Number(second ?? 0), timeZone).toISOString();
}

/** Wall-clock time in a time zone -> instant. */
export function zonedToUtc(day: string, hour: number, minute: number, second: number, timeZone: string): Date {
  const [year, month, date] = day.split("-").map(Number);
  const wall = Date.UTC(year ?? 0, (month ?? 1) - 1, date ?? 1, hour, minute, second);
  let guess = wall - offsetMs(new Date(wall), timeZone);
  // A second pass settles DST edges.
  guess = wall - offsetMs(new Date(guess), timeZone);
  return new Date(guess);
}

/** Zone offset (local - UTC) in milliseconds at an instant. */
function offsetMs(instant: Date, timeZone: string): number {
  const parts = localParts(instant, timeZone);
  const asUtc = Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, parts.second);
  return asUtc - Math.floor(instant.getTime() / 1000) * 1000;
}

function localParts(instant: Date, timeZone: string) {
  const values = Object.fromEntries(
    new Intl.DateTimeFormat("en-US", {
      timeZone,
      hourCycle: "h23",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    })
      .formatToParts(instant)
      .map((part) => [part.type, part.value]),
  );
  return {
    year: Number(values.year),
    month: Number(values.month),
    day: Number(values.day),
    hour: Number(values.hour) % 24,
    minute: Number(values.minute),
    second: Number(values.second),
  };
}

/** Instant -> "YYYY-MM-DD" in the time zone. */
export function localDay(iso: string, timeZone: string): string {
  const parts = localParts(new Date(iso), timeZone);
  return `${parts.year}-${pad(parts.month)}-${pad(parts.day)}`;
}

/** Instant -> "HH:mm" in the time zone. */
export function localTime(iso: string, timeZone: string): string {
  const parts = localParts(new Date(iso), timeZone);
  return `${pad(parts.hour)}:${pad(parts.minute)}`;
}

function pad(value: number): string {
  return String(value).padStart(2, "0");
}

export type DoseScheduleSource = {
  interval_hours: number | null;
  ends_on: string | null;
  status: ItemStatus;
  due_date: string | null;
};

export type DoseSchedule = {
  last_done_at: string | null;
  /** Day of last_done_at in the household time zone. */
  last_done_on: string | null;
  next_due_at: string | null;
  due_date: string | null;
  status: ItemStatus;
};

/**
 * The hourly schedule after the doses changed. It always follows the newest live
 * dose, so a late-recorded older dose does not move it. When the next dose would
 * fall after ends_on, the treatment is over and the item completes.
 * Only an active item changes status here.
 */
export function doseSchedule(item: DoseScheduleSource, liveDoseTimes: string[], timeZone: string): DoseSchedule {
  const newest = liveDoseTimes.reduce<string | null>(
    (latest, time) => (latest === null || Date.parse(time) > Date.parse(latest) ? time : latest),
    null,
  );
  if (!newest || !item.interval_hours) {
    return {
      last_done_at: newest,
      last_done_on: newest ? localDay(newest, timeZone) : null,
      next_due_at: null,
      due_date: item.due_date,
      status: item.status,
    };
  }
  const lastDay = localDay(newest, timeZone);
  const next = new Date(Date.parse(newest) + item.interval_hours * 3_600_000).toISOString();
  const nextDay = localDay(next, timeZone);
  if (item.ends_on && nextDay > item.ends_on) {
    return {
      last_done_at: newest,
      last_done_on: lastDay,
      next_due_at: null,
      due_date: item.due_date,
      status: item.status === "active" ? "completed" : item.status,
    };
  }
  return { last_done_at: newest, last_done_on: lastDay, next_due_at: next, due_date: nextDay, status: item.status };
}

/** A dose is "late" as soon as its time has passed, with no tolerance. */
export function isDoseLate(nextDueAt: string | null, now: string): boolean {
  return nextDueAt !== null && Date.parse(now) > Date.parse(nextDueAt);
}

/** Minutes until the next dose (negative when late). */
export function minutesUntil(nextDueAt: string, now: string): number {
  return Math.round((Date.parse(nextDueAt) - Date.parse(now)) / 60_000);
}
