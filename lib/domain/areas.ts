import { AREA_KINDS, type AreaKind } from "@/lib/domain/types";
import {
  AREA_SLUG_PATTERN,
  isRecord,
  readEnum,
  readNotes,
  unknownFields,
  type FieldError,
  type ParseResult,
} from "@/lib/domain/validate";

export type AreaInput = {
  slug: string;
  name: string;
  kind: AreaKind;
  sort_order: number;
  notes: string | null;
};

export type AreaPatch = Partial<Omit<AreaInput, "slug">> & { archived?: boolean };

/**
 * Suggested starting list for a house. Not seeded: the agent creates the real ones
 * through POST /api/agent/areas/bulk after the owner confirms them.
 */
export const SUGGESTED_AREAS: ReadonlyArray<Pick<AreaInput, "slug" | "name" | "kind">> = [
  { slug: "cozinha", name: "Cozinha", kind: "room" },
  { slug: "sala", name: "Sala", kind: "room" },
  { slug: "quarto_casal", name: "Quarto do casal", kind: "room" },
  { slug: "quarto_2", name: "Quarto 2", kind: "room" },
  { slug: "banheiro_social", name: "Banheiro social", kind: "room" },
  { slug: "banheiro_suite", name: "Banheiro da suíte", kind: "room" },
  { slug: "lavanderia", name: "Lavanderia", kind: "room" },
  { slug: "escritorio", name: "Escritório", kind: "room" },
  { slug: "quintal", name: "Quintal", kind: "outdoor" },
  { slug: "garagem", name: "Garagem", kind: "outdoor" },
  { slug: "jardim", name: "Jardim", kind: "outdoor" },
  { slug: "fachada", name: "Fachada", kind: "outdoor" },
  { slug: "telhado_calhas", name: "Telhado e calhas", kind: "outdoor" },
  { slug: "caixa_dagua", name: "Caixa d'água", kind: "system" },
  { slug: "eletrica", name: "Elétrica", kind: "system" },
  { slug: "hidraulica", name: "Hidráulica", kind: "system" },
  { slug: "ar_condicionado", name: "Ar-condicionado", kind: "system" },
  { slug: "gas", name: "Gás", kind: "system" },
  { slug: "portao_seguranca", name: "Portão e segurança", kind: "system" },
];

const CREATE_FIELDS = new Set(["slug", "name", "kind", "sort_order", "notes"]);
const PATCH_FIELDS = new Set(["name", "kind", "sort_order", "notes", "archived"]);

export function parseAreaCreate(body: unknown): ParseResult<AreaInput> {
  if (!isRecord(body)) {
    return { ok: false, details: [{ field: "body", message: "must be a JSON object" }] };
  }
  const details = unknownFields(body, CREATE_FIELDS);
  const slug = readSlug(body.slug, details);
  const name = readName(body.name, details);
  const kind = readEnum(body, "kind", AREA_KINDS, details, false) ?? "room";
  const sort_order = readSortOrder(body.sort_order, details) ?? 0;
  const notes = readNotes(body, "notes", details);
  if (details.length > 0 || !slug || !name) return { ok: false, details };
  return { ok: true, value: { slug, name, kind, sort_order, notes } };
}

export function parseAreaPatch(body: unknown): ParseResult<AreaPatch> {
  if (!isRecord(body)) {
    return { ok: false, details: [{ field: "body", message: "must be a JSON object" }] };
  }
  const details = unknownFields(body, PATCH_FIELDS);
  if ("slug" in body) {
    details.splice(details.findIndex((detail) => detail.field === "slug"), 1, {
      field: "slug",
      message: "cannot change; create a new area and archive this one",
    });
  }
  const patch: AreaPatch = {};
  if ("name" in body) {
    const name = readName(body.name, details);
    if (name) patch.name = name;
  }
  if ("kind" in body) {
    const kind = readEnum(body, "kind", AREA_KINDS, details, true);
    if (kind) patch.kind = kind;
  }
  if ("sort_order" in body) {
    const order = readSortOrder(body.sort_order, details);
    if (order !== null) patch.sort_order = order;
  }
  if ("notes" in body) patch.notes = readNotes(body, "notes", details);
  if ("archived" in body) {
    if (typeof body.archived === "boolean") patch.archived = body.archived;
    else details.push({ field: "archived", message: "must be true or false" });
  }
  if (details.length > 0) return { ok: false, details };
  return { ok: true, value: patch };
}

/** Slugs taken by fixed pages under /casa. */
export const RESERVED_AREA_SLUGS = new Set(["geral"]);

function readSlug(value: unknown, details: FieldError[]): string | null {
  if (typeof value === "string" && RESERVED_AREA_SLUGS.has(value)) {
    details.push({ field: "slug", message: `"${value}" is reserved` });
    return null;
  }
  if (typeof value === "string" && AREA_SLUG_PATTERN.test(value)) return value;
  details.push({ field: "slug", message: "is required: 1 to 40 characters (a-z, 0-9, _)" });
  return null;
}

function readName(value: unknown, details: FieldError[]): string | null {
  if (typeof value !== "string" || value.trim().length === 0 || value.trim().length > 80) {
    details.push({ field: "name", message: "is required and must be at most 80 characters" });
    return null;
  }
  return value.trim();
}

function readSortOrder(value: unknown, details: FieldError[]): number | null {
  if (value === undefined || value === null) return null;
  if (typeof value === "number" && Number.isInteger(value) && value >= -1000 && value <= 1000) return value;
  details.push({ field: "sort_order", message: "must be an integer from -1000 to 1000" });
  return null;
}
