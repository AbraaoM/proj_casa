import { isIsoDate } from "@/lib/domain/dates";
import type { Sex } from "@/lib/domain/types";
import { SEXES } from "@/lib/domain/types";
import { type FieldError, type ParseResult } from "@/lib/domain/validate";

export type DogInput = {
  name: string;
  breed: string | null;
  sex: Sex;
  birth_date: string | null;
  weight_kg: number | null;
  notes: string | null;
};

export type DogPatch = Partial<DogInput> & { archived?: boolean };

export type FamilyInput = {
  name: string;
  relationship: string | null;
  birth_date: string | null;
  notes: string | null;
};

export type FamilyPatch = Partial<FamilyInput> & { archived?: boolean };

export type VehicleInput = {
  name: string;
  make: string | null;
  model: string | null;
  year: number | null;
  plate: string | null;
  odometer_km: number | null;
  notes: string | null;
};

export type VehiclePatch = Partial<VehicleInput> & { archived?: boolean };

export type SettingsPatch = {
  city?: string;
  region?: string;
  country?: string;
  latitude?: number;
  longitude?: number;
  timezone?: string;
};

const DOG_FIELDS = new Set(["name", "breed", "sex", "birth_date", "weight_kg", "notes", "archived"]);
const FAMILY_FIELDS = new Set(["name", "relationship", "birth_date", "notes", "archived"]);
const VEHICLE_FIELDS = new Set(["name", "make", "model", "year", "plate", "odometer_km", "notes", "archived"]);
const SETTINGS_FIELDS = new Set(["city", "region", "country", "latitude", "longitude", "timezone"]);

export function parseDogCreate(body: unknown): ParseResult<DogInput> {
  const parsed = parseDogPatch(body, true);
  if (!parsed.ok) return parsed;
  if (!parsed.value.name) {
    return { ok: false, details: [{ field: "name", message: "is required" }] };
  }
  return {
    ok: true,
    value: {
      name: parsed.value.name,
      breed: parsed.value.breed ?? null,
      sex: parsed.value.sex ?? "unknown",
      birth_date: parsed.value.birth_date ?? null,
      weight_kg: parsed.value.weight_kg ?? null,
      notes: parsed.value.notes ?? null,
    },
  };
}

export function parseDogPatch(body: unknown, creating = false): ParseResult<DogPatch> {
  return parsePatch(body, DOG_FIELDS, (record, details) => {
    const patch: DogPatch = {};
    if ("name" in record || creating) {
      const name = readName(record.name, details);
      if (name) patch.name = name;
    }
    if ("breed" in record) patch.breed = readOptionalText(record.breed, "breed", 80, details);
    if ("sex" in record) {
      const sex = readSex(record.sex, details);
      if (sex) patch.sex = sex;
    }
    if ("birth_date" in record) patch.birth_date = readOptionalDate(record.birth_date, "birth_date", details);
    if ("weight_kg" in record) patch.weight_kg = readOptionalNumber(record.weight_kg, "weight_kg", 0, 200, details);
    if ("notes" in record) patch.notes = readOptionalText(record.notes, "notes", 4000, details);
    if ("archived" in record) patch.archived = readBoolean(record.archived, details);
    return patch;
  });
}

export function parseFamilyCreate(body: unknown): ParseResult<FamilyInput> {
  const parsed = parseFamilyPatch(body, true);
  if (!parsed.ok) return parsed;
  if (!parsed.value.name) return { ok: false, details: [{ field: "name", message: "is required" }] };
  return {
    ok: true,
    value: {
      name: parsed.value.name,
      relationship: parsed.value.relationship ?? null,
      birth_date: parsed.value.birth_date ?? null,
      notes: parsed.value.notes ?? null,
    },
  };
}

export function parseFamilyPatch(body: unknown, creating = false): ParseResult<FamilyPatch> {
  return parsePatch(body, FAMILY_FIELDS, (record, details) => {
    const patch: FamilyPatch = {};
    if ("name" in record || creating) {
      const name = readName(record.name, details);
      if (name) patch.name = name;
    }
    if ("relationship" in record) {
      patch.relationship = readOptionalText(record.relationship, "relationship", 40, details);
    }
    if ("birth_date" in record) patch.birth_date = readOptionalDate(record.birth_date, "birth_date", details);
    if ("notes" in record) patch.notes = readOptionalText(record.notes, "notes", 4000, details);
    if ("archived" in record) patch.archived = readBoolean(record.archived, details);
    return patch;
  });
}

export function parseVehicleCreate(body: unknown): ParseResult<VehicleInput> {
  const parsed = parseVehiclePatch(body, true);
  if (!parsed.ok) return parsed;
  if (!parsed.value.name) return { ok: false, details: [{ field: "name", message: "is required" }] };
  return {
    ok: true,
    value: {
      name: parsed.value.name,
      make: parsed.value.make ?? null,
      model: parsed.value.model ?? null,
      year: parsed.value.year ?? null,
      plate: parsed.value.plate ?? null,
      odometer_km: parsed.value.odometer_km ?? null,
      notes: parsed.value.notes ?? null,
    },
  };
}

export function parseVehiclePatch(body: unknown, creating = false): ParseResult<VehiclePatch> {
  return parsePatch(body, VEHICLE_FIELDS, (record, details) => {
    const patch: VehiclePatch = {};
    if ("name" in record || creating) {
      const name = readName(record.name, details);
      if (name) patch.name = name;
    }
    if ("make" in record) patch.make = readOptionalText(record.make, "make", 40, details);
    if ("model" in record) patch.model = readOptionalText(record.model, "model", 40, details);
    if ("year" in record) patch.year = readOptionalInteger(record.year, "year", 1900, 2100, details);
    if ("plate" in record) patch.plate = readOptionalText(record.plate, "plate", 16, details);
    if ("odometer_km" in record) {
      patch.odometer_km = readOptionalInteger(record.odometer_km, "odometer_km", 0, 2_000_000, details);
    }
    if ("notes" in record) patch.notes = readOptionalText(record.notes, "notes", 4000, details);
    if ("archived" in record) patch.archived = readBoolean(record.archived, details);
    return patch;
  });
}

export function parseSettingsPatch(body: unknown): ParseResult<SettingsPatch> {
  return parsePatch(body, SETTINGS_FIELDS, (record, details) => {
    const patch: SettingsPatch = {};
    if ("city" in record) {
      const city = readRequiredText(record.city, "city", 80, details);
      if (city) patch.city = city;
    }
    if ("region" in record) {
      const region = readRequiredText(record.region, "region", 40, details);
      if (region) patch.region = region;
    }
    if ("country" in record) {
      const country = readRequiredText(record.country, "country", 40, details);
      if (country) patch.country = country;
    }
    if ("latitude" in record) {
      const latitude = readRequiredNumber(record.latitude, "latitude", -90, 90, details);
      if (latitude !== null) patch.latitude = latitude;
    }
    if ("longitude" in record) {
      const longitude = readRequiredNumber(record.longitude, "longitude", -180, 180, details);
      if (longitude !== null) patch.longitude = longitude;
    }
    if ("timezone" in record) {
      const timezone = readTimeZone(record.timezone, details);
      if (timezone) patch.timezone = timezone;
    }
    return patch;
  });
}

function parsePatch<T>(
  body: unknown,
  allowed: Set<string>,
  read: (record: Record<string, unknown>, details: FieldError[]) => T,
): ParseResult<T> {
  if (!isRecord(body)) {
    return { ok: false, details: [{ field: "body", message: "must be a JSON object" }] };
  }
  const details: FieldError[] = Object.keys(body)
    .filter((key) => !allowed.has(key))
    .map((field) => ({ field, message: "is not a supported field" }));
  const value = read(body, details);
  if (details.length > 0) return { ok: false, details };
  return { ok: true, value };
}

function readName(value: unknown, details: FieldError[]): string | null {
  if (typeof value !== "string" || value.trim().length === 0 || value.trim().length > 80) {
    details.push({ field: "name", message: "is required and must be at most 80 characters" });
    return null;
  }
  return value.trim();
}

function readOptionalText(
  value: unknown,
  field: string,
  max: number,
  details: FieldError[],
): string | null {
  if (value === null || value === "") return null;
  if (typeof value !== "string" || value.length > max) {
    details.push({ field, message: `must be a string of at most ${max} characters` });
    return null;
  }
  return value;
}

function readRequiredText(value: unknown, field: string, max: number, details: FieldError[]): string | null {
  if (typeof value !== "string" || value.trim().length === 0 || value.trim().length > max) {
    details.push({ field, message: `is required and must be at most ${max} characters` });
    return null;
  }
  return value.trim();
}

function readOptionalDate(value: unknown, field: string, details: FieldError[]): string | null {
  if (value === null || value === "") return null;
  if (typeof value !== "string" || !isIsoDate(value)) {
    details.push({ field, message: "must be YYYY-MM-DD" });
    return null;
  }
  return value;
}

function readSex(value: unknown, details: FieldError[]): Sex | null {
  if (typeof value === "string" && (SEXES as readonly string[]).includes(value)) return value as Sex;
  details.push({ field: "sex", message: "must be male, female, or unknown" });
  return null;
}

function readOptionalNumber(
  value: unknown,
  field: string,
  min: number,
  max: number,
  details: FieldError[],
): number | null {
  if (value === null) return null;
  return readRequiredNumber(value, field, min, max, details);
}

function readRequiredNumber(
  value: unknown,
  field: string,
  min: number,
  max: number,
  details: FieldError[],
): number | null {
  if (typeof value !== "number" || !Number.isFinite(value) || value < min || value > max) {
    details.push({ field, message: `must be a number from ${min} to ${max}` });
    return null;
  }
  return value;
}

function readOptionalInteger(
  value: unknown,
  field: string,
  min: number,
  max: number,
  details: FieldError[],
): number | null {
  if (value === null) return null;
  if (typeof value !== "number" || !Number.isInteger(value) || value < min || value > max) {
    details.push({ field, message: `must be an integer from ${min} to ${max}` });
    return null;
  }
  return value;
}

function readBoolean(value: unknown, details: FieldError[]): boolean {
  if (typeof value === "boolean") return value;
  details.push({ field: "archived", message: "must be true or false" });
  return false;
}

function readTimeZone(value: unknown, details: FieldError[]): string | null {
  if (typeof value !== "string") {
    details.push({ field: "timezone", message: "must be an IANA timezone" });
    return null;
  }
  try {
    Intl.DateTimeFormat("en-US", { timeZone: value });
    return value;
  } catch {
    details.push({ field: "timezone", message: "must be an IANA timezone" });
    return null;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
