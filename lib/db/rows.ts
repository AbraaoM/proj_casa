import type {
  CareEvent,
  CareItem,
  Dog,
  Domain,
  FamilyMember,
  HouseholdSettings,
  ItemStatus,
  Priority,
  Sex,
  Vehicle,
} from "@/lib/domain/types";

export function mapItem(row: Record<string, unknown>): CareItem {
  return {
    id: text(row.id),
    domain: text(row.domain) as Domain,
    dog_id: nullableText(row.dog_id),
    family_member_id: nullableText(row.family_member_id),
    vehicle_id: nullableText(row.vehicle_id),
    subject_name: nullableText(row.subject_name),
    title: text(row.title),
    category: text(row.category),
    status: text(row.status) as ItemStatus,
    priority: text(row.priority) as Priority,
    due_date: dateOnly(row.due_date),
    last_done_on: dateOnly(row.last_done_on),
    interval_days: integerOrNull(row.interval_days),
    notes: nullableText(row.notes),
    created_by_agent: bool(row.created_by_agent),
    external_key: nullableText(row.external_key),
    created_at: timestamp(row.created_at),
    updated_at: timestamp(row.updated_at),
  };
}

export function mapEvent(row: Record<string, unknown>): CareEvent {
  return {
    id: text(row.id),
    care_item_id: text(row.care_item_id),
    done_on: dateOnly(row.done_on) ?? text(row.done_on),
    notes: nullableText(row.notes),
    weight_kg: numberOrNull(row.weight_kg),
    odometer_km: integerOrNull(row.odometer_km),
    amount_cents: integerOrNull(row.amount_cents),
    created_by_agent: bool(row.created_by_agent),
    external_key: nullableText(row.external_key),
    created_at: timestamp(row.created_at),
  };
}

export function mapDog(row: Record<string, unknown>): Dog {
  return {
    id: text(row.id),
    name: text(row.name),
    breed: nullableText(row.breed),
    sex: (nullableText(row.sex) ?? "unknown") as Sex,
    birth_date: dateOnly(row.birth_date),
    weight_kg: numberOrNull(row.weight_kg),
    notes: nullableText(row.notes),
    archived_at: row.archived_at == null ? null : timestamp(row.archived_at),
    created_by_agent: bool(row.created_by_agent),
    created_at: timestamp(row.created_at),
    updated_at: timestamp(row.updated_at),
  };
}

export function mapFamilyMember(row: Record<string, unknown>): FamilyMember {
  return {
    id: text(row.id),
    name: text(row.name),
    relationship: nullableText(row.relationship),
    birth_date: dateOnly(row.birth_date),
    notes: nullableText(row.notes),
    archived_at: row.archived_at == null ? null : timestamp(row.archived_at),
    created_by_agent: bool(row.created_by_agent),
    created_at: timestamp(row.created_at),
    updated_at: timestamp(row.updated_at),
  };
}

export function mapVehicle(row: Record<string, unknown>): Vehicle {
  return {
    id: text(row.id),
    name: text(row.name),
    make: nullableText(row.make),
    model: nullableText(row.model),
    year: integerOrNull(row.year),
    plate: nullableText(row.plate),
    odometer_km: integerOrNull(row.odometer_km),
    notes: nullableText(row.notes),
    archived_at: row.archived_at == null ? null : timestamp(row.archived_at),
    created_by_agent: bool(row.created_by_agent),
    created_at: timestamp(row.created_at),
    updated_at: timestamp(row.updated_at),
  };
}

export function mapSettings(row: Record<string, unknown>): HouseholdSettings {
  return {
    city: text(row.city),
    region: text(row.region),
    country: text(row.country),
    latitude: Number(row.latitude),
    longitude: Number(row.longitude),
    timezone: text(row.timezone),
    updated_at: timestamp(row.updated_at),
  };
}

function text(value: unknown): string {
  if (value instanceof Date) return value.toISOString();
  return String(value);
}

function nullableText(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  return text(value);
}

function dateOnly(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  return String(value).slice(0, 10);
}

function timestamp(value: unknown): string {
  if (value instanceof Date) return value.toISOString();
  return String(value);
}

function numberOrNull(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function integerOrNull(value: unknown): number | null {
  const number = numberOrNull(value);
  return number === null ? null : Math.trunc(number);
}

function bool(value: unknown): boolean {
  return value === true || value === "true" || value === "t";
}
