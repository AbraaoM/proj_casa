import { isIsoDate, isUuid } from "@/lib/domain/dates";
import {
  DEFAULT_WITHIN_DAYS,
  DOMAINS,
  ITEM_STATUSES,
  PRIORITIES,
  type Domain,
  type ItemStatus,
  type Priority,
} from "@/lib/domain/types";

export type FieldError = { field: string; message: string };
export type ParseResult<T> = { ok: true; value: T } | { ok: false; details: FieldError[] };

export type CreateItemInput = {
  domain: Domain;
  dog_id: string | null;
  family_member_id: string | null;
  vehicle_id: string | null;
  /** House area by id. Only for domain "house". */
  area_id: string | null;
  /** House area by slug, resolved to area_id by the service. Only for domain "house". */
  area_slug: string | null;
  title: string;
  category: string;
  status: ItemStatus;
  priority: Priority;
  due_date: string | null;
  last_done_on: string | null;
  interval_days: number | null;
  interval_months: number | null;
  notes: string | null;
  external_key: string | null;
};

export type DoneInput = {
  done_on: string | null;
  notes: string | null;
  external_key: string | null;
  weight_kg: number | null;
  odometer_km: number | null;
  amount_cents: number | null;
  provider: string | null;
  /** Finance category and account slugs for the cost. */
  finance_category?: string | null;
  account?: string | null;
};

const CREATE_FIELDS = new Set([
  "domain",
  "dog_id",
  "family_member_id",
  "vehicle_id",
  "area_id",
  "area",
  "title",
  "category",
  "status",
  "priority",
  "due_date",
  "last_done_on",
  "interval_days",
  "interval_months",
  "notes",
  "external_key",
]);

const DONE_FIELDS = new Set([
  "done_on",
  "notes",
  "external_key",
  "weight_kg",
  "odometer_km",
  "amount_cents",
  "provider",
  "finance_category",
  "account",
]);

const CATEGORY_PATTERN = /^[a-z0-9_]{1,40}$/;

export function parseCreateItem(body: unknown): ParseResult<CreateItemInput> {
  if (!isRecord(body)) {
    return { ok: false, details: [{ field: "body", message: "must be a JSON object" }] };
  }

  const details = unknownFields(body, CREATE_FIELDS);
  const domain = readEnum(body, "domain", DOMAINS, details, true);
  const dog_id = readUuid(body, "dog_id", details);
  const family_member_id = readUuid(body, "family_member_id", details);
  const vehicle_id = readUuid(body, "vehicle_id", details);
  const area_id = readUuid(body, "area_id", details);
  const area_slug = readAreaSlug(body, "area", details);
  const title = readTitle(body, details);
  const category = readCategory(body, details);
  const status = readEnum(body, "status", ITEM_STATUSES, details, false) ?? "active";
  const priority = readEnum(body, "priority", PRIORITIES, details, false) ?? "normal";
  const due_date = readDate(body, "due_date", details);
  const last_done_on = readDate(body, "last_done_on", details);
  const interval_days = readInterval(body, details);
  const interval_months = readInteger(body, "interval_months", details, 1, 120);
  if (interval_days !== null && interval_months !== null) {
    details.push({ field: "interval_months", message: "send interval_days or interval_months, not both" });
  }
  const notes = readNotes(body, "notes", details);
  const external_key = readExternalKey(body, details);

  if (domain) {
    assertSubject(domain, dog_id, family_member_id, vehicle_id, details);
    assertArea(domain, area_id, area_slug, details);
  }

  if (details.length > 0 || !domain || !title || !category) {
    return { ok: false, details };
  }

  return {
    ok: true,
    value: {
      domain,
      dog_id,
      family_member_id,
      vehicle_id,
      area_id,
      area_slug,
      title,
      category,
      status,
      priority,
      due_date,
      last_done_on,
      interval_days,
      interval_months,
      notes,
      external_key,
    },
  };
}

export function parseDoneBody(body: unknown): ParseResult<DoneInput> {
  if (!isRecord(body)) {
    return { ok: false, details: [{ field: "body", message: "must be a JSON object" }] };
  }

  const details = unknownFields(body, DONE_FIELDS);
  const done_on = readDate(body, "done_on", details);
  const notes = readNotes(body, "notes", details);
  const external_key = readExternalKey(body, details);
  const weight_kg = readDecimal(body, "weight_kg", details, 0, 200);
  const odometer_km = readInteger(body, "odometer_km", details, 0, 2_000_000);
  const amount_cents = readInteger(body, "amount_cents", details, 0, 100_000_000);
  const provider = readShortText(body, "provider", 120, details);
  const finance_category = readFinanceRef(body, "finance_category", details);
  const account = readFinanceRef(body, "account", details);
  if ((finance_category || account) && !amount_cents) {
    details.push({ field: finance_category ? "finance_category" : "account", message: "needs amount_cents" });
  }

  if (details.length > 0) return { ok: false, details };
  return {
    ok: true,
    value: { done_on, notes, external_key, weight_kg, odometer_km, amount_cents, provider, finance_category, account },
  };
}

const PATCH_FIELDS = new Set(
  [...CREATE_FIELDS].filter((field) => field !== "external_key"),
);

export function parseItemPatch(body: unknown): ParseResult<Partial<CreateItemInput>> {
  if (!isRecord(body)) {
    return { ok: false, details: [{ field: "body", message: "must be a JSON object" }] };
  }

  const details = unknownFields(body, PATCH_FIELDS);
  const patch: Partial<CreateItemInput> = {};

  if ("domain" in body) {
    const domain = readEnum(body, "domain", DOMAINS, details, true);
    if (domain) patch.domain = domain;
  }
  if ("dog_id" in body) patch.dog_id = readUuid(body, "dog_id", details);
  if ("family_member_id" in body) patch.family_member_id = readUuid(body, "family_member_id", details);
  if ("vehicle_id" in body) patch.vehicle_id = readUuid(body, "vehicle_id", details);
  if ("area_id" in body) patch.area_id = readUuid(body, "area_id", details);
  if ("area" in body) patch.area_slug = readAreaSlug(body, "area", details);
  if ("area_id" in body && "area" in body && body.area_id && body.area) {
    details.push({ field: "area", message: "send area or area_id, not both" });
  }
  if ("title" in body) {
    const title = readTitle(body, details);
    if (title) patch.title = title;
  }
  if ("category" in body) {
    const category = readCategory(body, details);
    if (category) patch.category = category;
  }
  if ("status" in body) {
    const status = readEnum(body, "status", ITEM_STATUSES, details, true);
    if (status) patch.status = status;
  }
  if ("priority" in body) {
    const priority = readEnum(body, "priority", PRIORITIES, details, true);
    if (priority) patch.priority = priority;
  }
  if ("due_date" in body) patch.due_date = readDate(body, "due_date", details);
  if ("last_done_on" in body) patch.last_done_on = readDate(body, "last_done_on", details);
  if ("interval_days" in body) patch.interval_days = readInterval(body, details);
  if ("interval_months" in body) patch.interval_months = readInteger(body, "interval_months", details, 1, 120);
  // The two schedules are exclusive: setting one clears the other.
  if (patch.interval_days != null && patch.interval_months != null) {
    details.push({ field: "interval_months", message: "send interval_days or interval_months, not both" });
  } else if (patch.interval_days != null) {
    patch.interval_months = null;
  } else if (patch.interval_months != null) {
    patch.interval_days = null;
  }
  if ("notes" in body) patch.notes = readNotes(body, "notes", details);

  if (details.length > 0) return { ok: false, details };
  return { ok: true, value: patch };
}

export function parseBulkBody(body: unknown): ParseResult<unknown[]> {
  if (!isRecord(body)) {
    return { ok: false, details: [{ field: "body", message: "must be a JSON object" }] };
  }
  const details = unknownFields(body, new Set(["items"]));
  if (!Array.isArray(body.items)) {
    details.push({ field: "items", message: "must be an array" });
  } else if (body.items.length > 50) {
    details.push({ field: "items", message: "must contain at most 50 items" });
  }
  if (details.length > 0 || !Array.isArray(body.items)) return { ok: false, details };
  return { ok: true, value: body.items };
}

export type ItemListQuery = {
  domain: Domain | null;
  status: ItemStatus | null;
  dog_id: string | null;
  family_member_id: string | null;
  vehicle_id: string | null;
  /** House area id or slug. */
  area: string | null;
  limit: number;
};

export function parseItemListQuery(params: URLSearchParams): ParseResult<ItemListQuery> {
  const details: FieldError[] = [];
  const domain = readQueryEnum(params, "domain", DOMAINS, details);
  const status = readQueryEnum(params, "status", ITEM_STATUSES, details);
  const dog_id = readQueryUuid(params, "dog_id", details);
  const family_member_id = readQueryUuid(params, "family_member_id", details);
  const vehicle_id = readQueryUuid(params, "vehicle_id", details);
  const area = readQueryArea(params, "area", details);

  const limitRaw = params.get("limit");
  let limit = 100;
  if (limitRaw !== null) {
    if (!/^\d+$/.test(limitRaw) || Number(limitRaw) < 1 || Number(limitRaw) > 200) {
      details.push({ field: "limit", message: "must be an integer from 1 to 200" });
    } else {
      limit = Number(limitRaw);
    }
  }

  if (details.length > 0) return { ok: false, details };
  return {
    ok: true,
    value: { domain, status, dog_id, family_member_id, vehicle_id, area, limit },
  };
}

export function parseAttentionQuery(params: URLSearchParams): ParseResult<{
  domain: Domain | null;
  within_days: number;
}> {
  const details: FieldError[] = [];
  const domainRaw = params.get("domain");
  let domain: Domain | null = null;
  if (domainRaw) {
    if ((DOMAINS as readonly string[]).includes(domainRaw)) {
      domain = domainRaw as Domain;
    } else {
      details.push({ field: "domain", message: "must be dog, house, finance, car, or family" });
    }
  }

  const withinRaw = params.get("within_days");
  let within_days = DEFAULT_WITHIN_DAYS;
  if (withinRaw !== null) {
    if (!/^\d+$/.test(withinRaw) || Number(withinRaw) > 365) {
      details.push({ field: "within_days", message: "must be an integer from 0 to 365" });
    } else {
      within_days = Number(withinRaw);
    }
  }

  if (details.length > 0) return { ok: false, details };
  return { ok: true, value: { domain, within_days } };
}

export function subjectErrors(input: {
  domain: Domain;
  dog_id: string | null;
  family_member_id: string | null;
  vehicle_id: string | null;
  area_id?: string | null;
  area_slug?: string | null;
}): FieldError[] {
  const details: FieldError[] = [];
  assertSubject(input.domain, input.dog_id, input.family_member_id, input.vehicle_id, details);
  assertArea(input.domain, input.area_id ?? null, input.area_slug ?? null, details);
  return details;
}

function assertArea(
  domain: Domain,
  areaId: string | null,
  areaSlug: string | null,
  details: FieldError[],
) {
  if (areaId && areaSlug) {
    details.push({ field: "area", message: "send area or area_id, not both" });
    return;
  }
  if (domain !== "house") {
    if (areaId) details.push({ field: "area_id", message: "must be empty for this domain" });
    if (areaSlug) details.push({ field: "area", message: "must be empty for this domain" });
  }
}

export const AREA_SLUG_PATTERN = /^[a-z0-9_]{1,40}$/;

function readAreaSlug(body: Record<string, unknown>, field: string, details: FieldError[]): string | null {
  const value = body[field];
  if (value === undefined || value === null || value === "") return null;
  if (typeof value === "string" && AREA_SLUG_PATTERN.test(value)) return value;
  details.push({ field, message: "must be an area slug of 1 to 40 characters (a-z, 0-9, _)" });
  return null;
}

function readShortText(
  body: Record<string, unknown>,
  field: string,
  max: number,
  details: FieldError[],
): string | null {
  const value = body[field];
  if (value === undefined || value === null || value === "") return null;
  if (typeof value !== "string" || value.trim().length === 0 || value.length > max) {
    details.push({ field, message: `must be a string of at most ${max} characters` });
    return null;
  }
  return value.trim();
}

function readQueryArea(params: URLSearchParams, field: string, details: FieldError[]): string | null {
  const value = params.get(field);
  if (!value) return null;
  if (isUuid(value) || AREA_SLUG_PATTERN.test(value)) return value;
  details.push({ field, message: "must be an area id or slug" });
  return null;
}

function assertSubject(
  domain: Domain,
  dogId: string | null,
  familyId: string | null,
  vehicleId: string | null,
  details: FieldError[],
) {
  const present = {
    dog_id: dogId,
    family_member_id: familyId,
    vehicle_id: vehicleId,
  };

  const required =
    domain === "dog" ? "dog_id" : domain === "family" ? "family_member_id" : domain === "car" ? "vehicle_id" : null;

  for (const [field, value] of Object.entries(present)) {
    if (details.some((detail) => detail.field === field)) continue;
    if (field === required) {
      if (!value) details.push({ field, message: "is required for this domain" });
      continue;
    }
    if (value) details.push({ field, message: "must be empty for this domain" });
  }
}

function unknownFields(body: Record<string, unknown>, allowed: Set<string>): FieldError[] {
  return Object.keys(body)
    .filter((key) => !allowed.has(key))
    .map((field) => ({ field, message: "is not a supported field" }));
}

function readEnum<T extends string>(
  body: Record<string, unknown>,
  field: string,
  allowed: readonly T[],
  details: FieldError[],
  required: boolean,
): T | null {
  const value = body[field];
  if (value === undefined || value === null) {
    if (required) details.push({ field, message: "is required" });
    return null;
  }
  if (typeof value === "string" && (allowed as readonly string[]).includes(value)) {
    return value as T;
  }
  details.push({ field, message: `must be one of: ${allowed.join(", ")}` });
  return null;
}

function readUuid(body: Record<string, unknown>, field: string, details: FieldError[]): string | null {
  const value = body[field];
  if (value === undefined || value === null || value === "") return null;
  if (typeof value === "string" && isUuid(value)) return value;
  details.push({ field, message: "must be a uuid" });
  return null;
}

function readTitle(body: Record<string, unknown>, details: FieldError[]): string | null {
  const value = body.title;
  if (typeof value !== "string" || value.trim().length === 0) {
    details.push({ field: "title", message: "is required" });
    return null;
  }
  const title = value.trim();
  if (title.length > 160) {
    details.push({ field: "title", message: "must be at most 160 characters" });
    return null;
  }
  return title;
}

function readCategory(body: Record<string, unknown>, details: FieldError[]): string | null {
  const value = body.category;
  if (typeof value !== "string" || !CATEGORY_PATTERN.test(value)) {
    details.push({
      field: "category",
      message: "must be a slug of 1 to 40 characters (a-z, 0-9, _)",
    });
    return null;
  }
  return value;
}

function readDate(body: Record<string, unknown>, field: string, details: FieldError[]): string | null {
  const value = body[field];
  if (value === undefined || value === null || value === "") return null;
  if (typeof value === "string" && isIsoDate(value)) return value;
  details.push({ field, message: "must be YYYY-MM-DD" });
  return null;
}

function readInterval(body: Record<string, unknown>, details: FieldError[]): number | null {
  const value = body.interval_days;
  if (value === undefined || value === null) return null;
  if (typeof value !== "number" || !Number.isInteger(value) || value < 1 || value > 3650) {
    details.push({ field: "interval_days", message: "must be an integer from 1 to 3650, or null" });
    return null;
  }
  return value;
}

function readNotes(body: Record<string, unknown>, field: string, details: FieldError[]): string | null {
  const value = body[field];
  if (value === undefined || value === null || value === "") return null;
  if (typeof value !== "string" || value.length > 4000) {
    details.push({ field, message: "must be a string of at most 4000 characters" });
    return null;
  }
  return value;
}

function readExternalKey(body: Record<string, unknown>, details: FieldError[]): string | null {
  const value = body.external_key;
  if (value === undefined || value === null || value === "") return null;
  if (typeof value !== "string" || value.length > 200) {
    details.push({ field: "external_key", message: "must be a string of at most 200 characters" });
    return null;
  }
  return value;
}

function readDecimal(
  body: Record<string, unknown>,
  field: string,
  details: FieldError[],
  min: number,
  max: number,
): number | null {
  const value = body[field];
  if (value === undefined || value === null) return null;
  if (typeof value !== "number" || !Number.isFinite(value) || value < min || value > max) {
    details.push({ field, message: `must be a number from ${min} to ${max}` });
    return null;
  }
  return value;
}

function readInteger(
  body: Record<string, unknown>,
  field: string,
  details: FieldError[],
  min: number,
  max: number,
): number | null {
  const value = body[field];
  if (value === undefined || value === null) return null;
  if (typeof value !== "number" || !Number.isInteger(value) || value < min || value > max) {
    details.push({ field, message: `must be an integer from ${min} to ${max}` });
    return null;
  }
  return value;
}

function readQueryEnum<T extends string>(
  params: URLSearchParams,
  field: string,
  allowed: readonly T[],
  details: FieldError[],
): T | null {
  const value = params.get(field);
  if (!value) return null;
  if ((allowed as readonly string[]).includes(value)) return value as T;
  details.push({ field, message: `must be one of: ${allowed.join(", ")}` });
  return null;
}

function readQueryUuid(params: URLSearchParams, field: string, details: FieldError[]): string | null {
  const value = params.get(field);
  if (!value) return null;
  if (isUuid(value)) return value;
  details.push({ field, message: "must be a uuid" });
  return null;
}

function readFinanceRef(body: Record<string, unknown>, field: string, details: FieldError[]): string | null {
  const value = body[field];
  if (value === undefined || value === null || value === "") return null;
  if (typeof value === "string" && (CATEGORY_PATTERN.test(value) || isUuid(value))) return value;
  details.push({ field, message: "must be a slug or a uuid" });
  return null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export {
  assertArea,
  assertSubject,
  isRecord,
  readAreaSlug,
  readCategory,
  readDate,
  readDecimal,
  readEnum,
  readExternalKey,
  readInteger,
  readNotes,
  readQueryArea,
  readQueryEnum,
  readQueryUuid,
  readShortText,
  readTitle,
  readUuid,
  unknownFields,
};
