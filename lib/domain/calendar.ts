import { addDays, isIsoDate } from "@/lib/domain/dates";
import type { FieldError } from "@/lib/errors";

/** Least privilege that can read and create events on calendars the person picks. */
export const CALENDAR_SCOPE = "openid email https://www.googleapis.com/auth/calendar.events";
export const GOOGLE_AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
export const DEFAULT_WITHIN_DAYS = 14;
export const MAX_WITHIN_DAYS = 30;

export type GoogleConfig = { clientId: string; clientSecret: string };

export type AgendaEvent = {
  id: string;
  title: string;
  /** YYYY-MM-DD when all_day, otherwise an ISO date-time. */
  starts_at: string;
  /** Last inclusive day when all_day; otherwise the end instant. Null for a single all-day or an open end. */
  ends_at: string | null;
  all_day: boolean;
  location: string | null;
  html_link: string | null;
  /** Casa username of the account the event was read from. */
  owner: string;
};

export type AgendaDraft = {
  title: string;
  all_day: boolean;
  starts_at: string;
  ends_at: string | null;
  description: string | null;
  location: string | null;
  external_key: string | null;
};

type Parsed<T> = { ok: true; value: T } | { ok: false; details: FieldError[] };

const LOCAL_TIME = /^(\d{2}):(\d{2})(?::(\d{2}))?$/;
const OFFSET_TIME = /^(\d{4}-\d{2}-\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?(Z|[+-]\d{2}:\d{2})$/;

export function readGoogleConfig(env: Record<string, string | undefined> = process.env): GoogleConfig | null {
  const clientId = env.GOOGLE_CLIENT_ID?.trim() ?? "";
  const clientSecret = env.GOOGLE_CLIENT_SECRET?.trim() ?? "";
  if (!clientId || !clientSecret) return null;
  if (clientId.length > 200 || clientSecret.length > 200) return null;
  if (/[\r\n\s]/.test(clientId) || /[\r\n\s]/.test(clientSecret)) return null;
  return { clientId, clientSecret };
}

export function googleRedirectUri(origin: string): string {
  return `${origin.replace(/\/+$/, "")}/api/google/callback`;
}

export function buildAuthUrl(input: {
  clientId: string;
  redirectUri: string;
  state: string;
  codeChallenge: string;
}): string {
  const params = new URLSearchParams({
    client_id: input.clientId,
    redirect_uri: input.redirectUri,
    response_type: "code",
    scope: CALENDAR_SCOPE,
    state: input.state,
    code_challenge: input.codeChallenge,
    code_challenge_method: "S256",
    access_type: "offline",
    prompt: "consent",
    include_granted_scopes: "true",
  });
  return `${GOOGLE_AUTH_URL}?${params.toString()}`;
}

export function isGoogleAuthUrl(url: string): boolean {
  return url.startsWith(`${GOOGLE_AUTH_URL}?`);
}

/** Minutes east of UTC, e.g. America/Sao_Paulo → -180. */
export function offsetMinutes(timeZone: string, instant: Date): number {
  const part = new Intl.DateTimeFormat("en-US", { timeZone, timeZoneName: "longOffset" })
    .formatToParts(instant)
    .find((item) => item.type === "timeZoneName")?.value ?? "GMT";
  if (part === "GMT" || part === "UTC") return 0;
  const match = /^GMT([+-])(\d{1,2})(?::(\d{2}))?$/.exec(part);
  if (!match) return 0;
  const sign = match[1] === "-" ? -1 : 1;
  return sign * (Number(match[2]) * 60 + Number(match[3] ?? "0"));
}

export function formatOffset(timeZone: string, instant: Date): string {
  const minutes = offsetMinutes(timeZone, instant);
  const sign = minutes < 0 ? "-" : "+";
  const abs = Math.abs(minutes);
  const hours = String(Math.floor(abs / 60)).padStart(2, "0");
  const mins = String(abs % 60).padStart(2, "0");
  return `${sign}${hours}:${mins}`;
}

/** Wall-clock date and time in a zone, as RFC3339 with that zone's offset. */
export function zonedToOffsetIso(date: string, time: string, timeZone: string): string {
  const clock = LOCAL_TIME.exec(time);
  if (!isIsoDate(date) || !clock) throw new Error("Invalid zoned date.");
  const seconds = clock[3] ?? "00";
  const guess = new Date(`${date}T${clock[1]}:${clock[2]}:${seconds}Z`);
  const first = offsetMinutes(timeZone, guess);
  const adjusted = new Date(guess.getTime() - first * 60_000);
  const second = offsetMinutes(timeZone, adjusted);
  const instant = first === second ? adjusted : new Date(guess.getTime() - second * 60_000);
  return `${date}T${clock[1]}:${clock[2]}:${seconds}${formatOffset(timeZone, instant)}`;
}

export function agendaWindow(today: string, withinDays: number, timeZone: string): { timeMin: string; timeMax: string } {
  return {
    timeMin: zonedToOffsetIso(today, "00:00", timeZone),
    timeMax: zonedToOffsetIso(addDays(today, withinDays), "00:00", timeZone),
  };
}

export function parseWithinDays(raw: unknown): Parsed<number> {
  if (raw === undefined || raw === null || raw === "") return { ok: true, value: DEFAULT_WITHIN_DAYS };
  const value = typeof raw === "number" ? raw : typeof raw === "string" && /^\d+$/.test(raw) ? Number(raw) : NaN;
  if (!Number.isInteger(value) || value < 1 || value > MAX_WITHIN_DAYS) {
    return { ok: false, details: [{ field: "within_days", message: `must be an integer from 1 to ${MAX_WITHIN_DAYS}` }] };
  }
  return { ok: true, value };
}

const CREATE_FIELDS = ["title", "starts_at", "ends_at", "description", "location", "external_key"] as const;

export function parseAgendaCreate(body: unknown, timeZone: string): Parsed<AgendaDraft> {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return { ok: false, details: [{ field: "body", message: "must be an object" }] };
  }
  const record = body as Record<string, unknown>;
  const details: FieldError[] = [];
  for (const key of Object.keys(record)) {
    if (!(CREATE_FIELDS as readonly string[]).includes(key)) details.push({ field: key, message: "is not a known field" });
  }
  const title = typeof record.title === "string" ? record.title.trim() : "";
  if (!title || title.length > 180) details.push({ field: "title", message: "must be a string of 1 to 180 characters" });
  const description = readOptional(record, "description", 2000, details);
  const location = readOptional(record, "location", 200, details);
  const external_key = readExternal(record, details);
  const start = readWhen(record.starts_at, "starts_at", timeZone, details);
  const end = record.ends_at === undefined || record.ends_at === null || record.ends_at === ""
    ? null
    : readWhen(record.ends_at, "ends_at", timeZone, details);
  if (details.length > 0 || !start) return { ok: false, details };
  if (end && end.all_day !== start.all_day) {
    return { ok: false, details: [{ field: "ends_at", message: "must be a date when starts_at is a date, or a time when starts_at is a time" }] };
  }
  const ends_at = end ? end.value : start.all_day ? null : plusMinutes(start.value, 60, timeZone);
  if (!start.all_day && ends_at && Date.parse(ends_at) <= Date.parse(start.value)) {
    return { ok: false, details: [{ field: "ends_at", message: "must be after starts_at" }] };
  }
  if (start.all_day && end && end.value < start.value) {
    return { ok: false, details: [{ field: "ends_at", message: "must be on or after starts_at" }] };
  }
  return {
    ok: true,
    value: {
      title,
      all_day: start.all_day,
      starts_at: start.value,
      ends_at: start.all_day && ends_at === start.value ? null : ends_at,
      description,
      location,
      external_key,
    },
  };
}

export function toGoogleEventBody(draft: AgendaDraft, timeZone: string): Record<string, unknown> {
  const body: Record<string, unknown> = { summary: draft.title };
  if (draft.description) body.description = draft.description;
  if (draft.location) body.location = draft.location;
  if (draft.all_day) {
    const last = draft.ends_at ?? draft.starts_at;
    body.start = { date: draft.starts_at };
    body.end = { date: addDays(last, 1) };
    return body;
  }
  body.start = { dateTime: draft.starts_at, timeZone };
  body.end = { dateTime: draft.ends_at, timeZone };
  return body;
}

type GoogleWhen = { date?: unknown; dateTime?: unknown };
type GoogleItem = {
  id?: unknown;
  status?: unknown;
  summary?: unknown;
  htmlLink?: unknown;
  location?: unknown;
  start?: GoogleWhen;
  end?: GoogleWhen;
};

export function mapGoogleEvent(raw: unknown, owner: string): AgendaEvent | null {
  if (!raw || typeof raw !== "object") return null;
  const item = raw as GoogleItem;
  if (item.status === "cancelled" || typeof item.id !== "string" || !item.id) return null;
  const startDate = typeof item.start?.date === "string" ? item.start.date : null;
  const startTime = typeof item.start?.dateTime === "string" ? item.start.dateTime : null;
  if (!startDate && !startTime) return null;
  const allDay = startDate !== null;
  const starts_at = (allDay ? startDate : startTime) as string;
  let ends_at: string | null = null;
  if (allDay && typeof item.end?.date === "string" && isIsoDate(item.end.date)) {
    const last = addDays(item.end.date, -1);
    ends_at = last > starts_at ? last : null;
  } else if (!allDay && typeof item.end?.dateTime === "string") {
    ends_at = item.end.dateTime;
  }
  const summary = typeof item.summary === "string" ? item.summary.trim() : "";
  return {
    id: item.id,
    title: (summary || "(sem título)").slice(0, 180),
    starts_at,
    ends_at,
    all_day: allDay,
    location: typeof item.location === "string" && item.location.trim() ? item.location.trim().slice(0, 200) : null,
    html_link: safeLink(item.htmlLink),
    owner,
  };
}

export function sortAgenda(events: AgendaEvent[]): AgendaEvent[] {
  return [...events].sort((a, b) => a.starts_at.localeCompare(b.starts_at) || a.owner.localeCompare(b.owner) || a.title.localeCompare(b.title));
}

function safeLink(value: unknown): string | null {
  if (typeof value !== "string" || !value.startsWith("https://")) return null;
  try {
    const url = new URL(value);
    if (url.protocol !== "https:") return null;
    return url.toString();
  } catch {
    return null;
  }
}

function readOptional(record: Record<string, unknown>, field: string, max: number, details: FieldError[]): string | null {
  const value = record[field];
  if (value === undefined || value === null || value === "") return null;
  if (typeof value !== "string" || value.length > max) {
    details.push({ field, message: `must be a string of at most ${max} characters` });
    return null;
  }
  return value;
}

function readExternal(record: Record<string, unknown>, details: FieldError[]): string | null {
  const value = record.external_key;
  if (value === undefined || value === null || value === "") return null;
  if (typeof value !== "string" || value.length > 200) {
    details.push({ field: "external_key", message: "must be a string of at most 200 characters" });
    return null;
  }
  return value;
}

function readWhen(
  raw: unknown,
  field: string,
  timeZone: string,
  details: FieldError[],
): { all_day: boolean; value: string } | null {
  if (typeof raw !== "string" || !raw.trim()) {
    details.push({ field, message: "must be a date (AAAA-MM-DD) or a date-time" });
    return null;
  }
  const text = raw.trim();
  if (isIsoDate(text)) return { all_day: true, value: text };
  const offset = OFFSET_TIME.exec(text);
  if (offset) {
    if (!isIsoDate(offset[1]!)) {
      details.push({ field, message: "must be a date (AAAA-MM-DD) or a date-time" });
      return null;
    }
    const normalized = text.endsWith("Z") || /[+-]\d{2}:\d{2}$/.test(text) ? withSeconds(text) : text;
    if (Number.isNaN(Date.parse(normalized))) {
      details.push({ field, message: "must be a date (AAAA-MM-DD) or a date-time" });
      return null;
    }
    return { all_day: false, value: normalized };
  }
  const local = /^(\d{4}-\d{2}-\d{2})T(\d{2}:\d{2}(?::\d{2})?)$/.exec(text);
  if (local && isIsoDate(local[1]!) && LOCAL_TIME.test(local[2]!)) {
    return { all_day: false, value: zonedToOffsetIso(local[1]!, local[2]!, timeZone) };
  }
  details.push({ field, message: "must be a date (AAAA-MM-DD) or a date-time" });
  return null;
}

function withSeconds(value: string): string {
  if (/T\d{2}:\d{2}(Z|[+-])/.test(value)) return value.replace(/T(\d{2}:\d{2})(Z|[+-])/, "T$1:00$2");
  return value;
}

function plusMinutes(iso: string, minutes: number, timeZone: string): string {
  const instant = new Date(Date.parse(iso) + minutes * 60_000);
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(instant);
  const get = (type: string) => parts.find((part) => part.type === type)?.value ?? "00";
  let hour = get("hour");
  if (hour === "24") hour = "00";
  return `${get("year")}-${get("month")}-${get("day")}T${hour}:${get("minute")}:${get("second")}${formatOffset(timeZone, instant)}`;
}
