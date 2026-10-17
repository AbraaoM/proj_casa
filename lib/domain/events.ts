import { isIsoDate } from "@/lib/domain/dates";
import { readEventFinance } from "@/lib/domain/finance/validate";
import { DOMAINS, type Domain } from "@/lib/domain/types";
import {
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
  type FieldError,
  type ParseResult,
} from "@/lib/domain/validate";

/** Something that was done. Standalone, or tied to a pending item via care_item_id. */
export type CreateEventInput = {
  care_item_id: string | null;
  domain: Domain | null;
  dog_id: string | null;
  family_member_id: string | null;
  vehicle_id: string | null;
  area_id: string | null;
  area_slug: string | null;
  category: string | null;
  title: string | null;
  done_on: string | null;
  notes: string | null;
  provider: string | null;
  weight_kg: number | null;
  odometer_km: number | null;
  amount_cents: number | null;
  external_key: string | null;
  /** Finance category slug for the cost (default: mapped from domain and category). */
  finance_category?: string | null;
  /** Finance account slug the cost was paid from. */
  account?: string | null;
};

export type EventPatch = {
  done_on?: string;
  title?: string;
  category?: string;
  notes?: string | null;
  provider?: string | null;
  weight_kg?: number | null;
  odometer_km?: number | null;
  amount_cents?: number | null;
  voided?: boolean;
};

export type EventListQuery = {
  domain: Domain | null;
  dog_id: string | null;
  family_member_id: string | null;
  vehicle_id: string | null;
  area: string | null;
  care_item_id: string | null;
  category: string | null;
  from: string | null;
  to: string | null;
  include_voided: boolean;
  limit: number;
  offset: number;
};

const CREATE_FIELDS = new Set([
  "care_item_id",
  "domain",
  "dog_id",
  "family_member_id",
  "vehicle_id",
  "area_id",
  "area",
  "category",
  "title",
  "done_on",
  "notes",
  "provider",
  "weight_kg",
  "odometer_km",
  "amount_cents",
  "external_key",
  "finance_category",
  "account",
]);

const PATCH_FIELDS = new Set([
  "done_on",
  "title",
  "category",
  "notes",
  "provider",
  "weight_kg",
  "odometer_km",
  "amount_cents",
  "voided",
]);

export function parseCreateEvent(body: unknown): ParseResult<CreateEventInput> {
  if (!isRecord(body)) {
    return { ok: false, details: [{ field: "body", message: "must be a JSON object" }] };
  }
  const details = unknownFields(body, CREATE_FIELDS);
  const care_item_id = readUuid(body, "care_item_id", details);
  const linked = care_item_id !== null;

  const domain = readEnum(body, "domain", DOMAINS, details, !linked);
  const dog_id = readUuid(body, "dog_id", details);
  const family_member_id = readUuid(body, "family_member_id", details);
  const vehicle_id = readUuid(body, "vehicle_id", details);
  const area_id = readUuid(body, "area_id", details);
  const area_slug = readAreaSlug(body, "area", details);

  let category: string | null = null;
  let title: string | null = null;
  if (linked) {
    for (const field of ["category", "title"] as const) {
      if (body[field] !== undefined && body[field] !== null) {
        details.push({ field, message: "is inherited from care_item_id; omit it" });
      }
    }
  } else {
    category = readCategory(body, details);
    title = readTitle(body, details);
  }

  const done_on = readDate(body, "done_on", details);
  const notes = readNotes(body, "notes", details);
  const provider = readShortText(body, "provider", 120, details);
  const weight_kg = readDecimal(body, "weight_kg", details, 0, 200);
  const odometer_km = readInteger(body, "odometer_km", details, 0, 2_000_000);
  const amount_cents = readInteger(body, "amount_cents", details, 0, 100_000_000);
  const external_key = readExternalKey(body, details);
  const finance = readEventFinance(body, details);
  if ((finance.finance_category || finance.account) && !amount_cents) {
    details.push({ field: finance.finance_category ? "finance_category" : "account", message: "needs amount_cents" });
  }

  if (domain && !linked) {
    assertSubject(domain, dog_id, family_member_id, vehicle_id, details);
    assertArea(domain, area_id, area_slug, details);
  }
  if (domain) measurementErrors(domain, weight_kg, odometer_km, details);

  if (details.length > 0) return { ok: false, details };
  return {
    ok: true,
    value: {
      care_item_id,
      domain,
      dog_id,
      family_member_id,
      vehicle_id,
      area_id,
      area_slug,
      category,
      title,
      done_on,
      notes,
      provider,
      weight_kg,
      odometer_km,
      amount_cents,
      external_key,
      ...finance,
    },
  };
}

/** weight_kg belongs to dogs and odometer_km to cars. Anything else is a mistake worth reporting. */
export function measurementErrors(
  domain: Domain,
  weightKg: number | null,
  odometerKm: number | null,
  details: FieldError[] = [],
): FieldError[] {
  if (weightKg !== null && domain !== "dog") {
    details.push({ field: "weight_kg", message: "is only allowed for domain dog" });
  }
  if (odometerKm !== null && domain !== "car") {
    details.push({ field: "odometer_km", message: "is only allowed for domain car" });
  }
  return details;
}

export function parseEventPatch(body: unknown): ParseResult<EventPatch> {
  if (!isRecord(body)) {
    return { ok: false, details: [{ field: "body", message: "must be a JSON object" }] };
  }
  const details = unknownFields(body, PATCH_FIELDS);
  const patch: EventPatch = {};
  if ("done_on" in body) {
    const doneOn = readDate(body, "done_on", details);
    if (doneOn) patch.done_on = doneOn;
    else if (!details.some((detail) => detail.field === "done_on")) {
      details.push({ field: "done_on", message: "cannot be empty" });
    }
  }
  if ("title" in body) {
    const title = readTitle(body, details);
    if (title) patch.title = title;
  }
  if ("category" in body) {
    const category = readCategory(body, details);
    if (category) patch.category = category;
  }
  if ("notes" in body) patch.notes = readNotes(body, "notes", details);
  if ("provider" in body) patch.provider = readShortText(body, "provider", 120, details);
  if ("weight_kg" in body) patch.weight_kg = readDecimal(body, "weight_kg", details, 0, 200);
  if ("odometer_km" in body) patch.odometer_km = readInteger(body, "odometer_km", details, 0, 2_000_000);
  if ("amount_cents" in body) {
    patch.amount_cents = readInteger(body, "amount_cents", details, 0, 100_000_000);
  }
  if ("voided" in body) {
    if (typeof body.voided === "boolean") patch.voided = body.voided;
    else details.push({ field: "voided", message: "must be true or false" });
  }
  if (details.length > 0) return { ok: false, details };
  return { ok: true, value: patch };
}

export function parseEventListQuery(params: URLSearchParams): ParseResult<EventListQuery> {
  const details: FieldError[] = [];
  const domain = readQueryEnum(params, "domain", DOMAINS, details);
  const dog_id = readQueryUuid(params, "dog_id", details);
  const family_member_id = readQueryUuid(params, "family_member_id", details);
  const vehicle_id = readQueryUuid(params, "vehicle_id", details);
  const care_item_id = readQueryUuid(params, "care_item_id", details);
  const area = readQueryArea(params, "area", details);

  const categoryRaw = params.get("category");
  let category: string | null = null;
  if (categoryRaw) {
    if (/^[a-z0-9_]{1,40}$/.test(categoryRaw)) category = categoryRaw;
    else details.push({ field: "category", message: "must be a category slug" });
  }

  const from = readQueryDate(params, "from", details);
  const to = readQueryDate(params, "to", details);
  if (from && to && from > to) details.push({ field: "from", message: "must be on or before to" });

  const include_voided = params.get("include_voided") === "1";
  const limit = readQueryInt(params, "limit", 1, 200, 50, details);
  const offset = readQueryInt(params, "offset", 0, 100_000, 0, details);

  if (details.length > 0) return { ok: false, details };
  return {
    ok: true,
    value: {
      domain,
      dog_id,
      family_member_id,
      vehicle_id,
      area,
      care_item_id,
      category,
      from,
      to,
      include_voided,
      limit,
      offset,
    },
  };
}

function readQueryDate(params: URLSearchParams, field: string, details: FieldError[]): string | null {
  const value = params.get(field);
  if (!value) return null;
  if (isIsoDate(value)) return value;
  details.push({ field, message: "must be YYYY-MM-DD" });
  return null;
}

function readQueryInt(
  params: URLSearchParams,
  field: string,
  min: number,
  max: number,
  fallback: number,
  details: FieldError[],
): number {
  const value = params.get(field);
  if (value === null) return fallback;
  if (!/^\d+$/.test(value) || Number(value) < min || Number(value) > max) {
    details.push({ field, message: `must be an integer from ${min} to ${max}` });
    return fallback;
  }
  return Number(value);
}
