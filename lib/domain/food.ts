/**
 * Food is stock, dishes, a shopping list and the calories of what was eaten.
 * Pure: quantities are milli-units (1.5 un = 1500) so nothing depends on float dust.
 * A stated calorie wins. Otherwise TACO fills it by name (see food/taco.ts).
 * An ambiguous name stays unknown, and a dish with any unknown line has no per-serving total.
 */
import { daysUntil, isIsoDate, isUuid } from "@/lib/domain/dates";
import type { FieldError, ParseResult } from "@/lib/domain/validate";

export const FOOD_UNITS = ["g", "ml", "un"] as const;
export type FoodUnit = (typeof FOOD_UNITS)[number];

export const EXPIRY_SOON_DAYS = 3;

export type Expiry = "none" | "ok" | "soon" | "expired";

export type StockDraft = {
  name: string;
  unit: FoodUnit;
  quantity_milli: number;
  min_quantity_milli: number | null;
  expires_on: string | null;
  kcal_per_100: number | null;
  kcal_each: number | null;
  external_key: string | null;
  /** TACO row, when the caller already picked one. Null lets the name decide. */
  taco_id: number | null;
};

export type StockPatch = {
  name?: string;
  unit?: FoodUnit;
  quantity_milli?: number;
  min_quantity_milli?: number | null;
  expires_on?: string | null;
  kcal_per_100?: number | null;
  kcal_each?: number | null;
  archived?: boolean;
  taco_id?: number | null;
};

export type IngredientDraft = {
  name: string | null;
  quantity_milli: number;
  unit: FoodUnit;
  food_item_id: string | null;
  kcal: number | null;
  taco_id: number | null;
};

export type DishDraft = {
  name: string;
  servings: number;
  notes: string | null;
  external_key: string | null;
  ingredients: IngredientDraft[];
};

export type DishPatch = {
  name?: string;
  servings?: number;
  notes?: string | null;
  archived?: boolean;
  ingredients?: IngredientDraft[];
};

export type ShoppingDraft = {
  name: string | null;
  quantity_milli: number | null;
  unit: FoodUnit | null;
  food_item_id: string | null;
  external_key: string | null;
};

export type MealDraft = {
  eaten_on: string;
  family_member_id: string | null;
  dish_id: string | null;
  title: string | null;
  servings_milli: number;
  kcal: number | null;
  external_key: string | null;
};

const CREATE_STOCK = ["name", "unit", "quantity", "min_quantity", "expires_on", "kcal_per_100", "kcal_each", "external_key", "taco_id"] as const;
const PATCH_STOCK = ["name", "unit", "quantity", "min_quantity", "expires_on", "kcal_per_100", "kcal_each", "archived", "taco_id"] as const;
const DISH_FIELDS = ["name", "servings", "notes", "external_key", "ingredients"] as const;
const PATCH_DISH = ["name", "servings", "notes", "archived", "ingredients"] as const;
const SHOPPING_FIELDS = ["name", "quantity", "unit", "food_item_id", "external_key"] as const;
const MEAL_FIELDS = ["eaten_on", "family_member_id", "dish_id", "title", "servings", "kcal", "external_key"] as const;

/** 1 unit in milli-units. */
export function fromMilli(milli: number): number {
  return Number((milli / 1000).toFixed(3));
}

export function foodSlug(name: string): string {
  const slug = name
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_|_$/g, "")
    .slice(0, 40)
    .replace(/_$/g, "");
  return slug || "item";
}

export function nextSlug(base: string, taken: ReadonlySet<string>): string {
  if (!taken.has(base)) return base;
  for (let n = 2; n < 100; n += 1) {
    const candidate = `${base.slice(0, 36)}_${n}`.replace(/^_|_$/g, "");
    if (!taken.has(candidate)) return candidate;
  }
  return `${base.slice(0, 28)}_${taken.size}`;
}

/** kcal_per_100 is the label on grams and millilitres. kcal_each is one piece. */
export function kcalFits(unit: FoodUnit, kcalPer100: number | null, kcalEach: number | null): string | null {
  if (unit === "un" && kcalPer100 !== null) return "kcal_per_100 is only for g or ml";
  if (unit !== "un" && kcalEach !== null) return "kcal_each is only for un";
  return null;
}

export function isLow(quantityMilli: number, minMilli: number | null): boolean {
  return minMilli !== null && quantityMilli <= minMilli;
}

/** How much is missing to reach the minimum. null when there is nothing to add (already there, or no minimum). */
export function shortfallMilli(quantityMilli: number, minMilli: number | null): number | null {
  if (minMilli === null || quantityMilli >= minMilli) return null;
  return minMilli - quantityMilli;
}

export function expiryOf(expiresOn: string | null, today: string): Expiry {
  if (!expiresOn) return "none";
  const days = daysUntil(expiresOn, today);
  if (days < 0) return "expired";
  if (days <= EXPIRY_SOON_DAYS) return "soon";
  return "ok";
}

export type StockFlags = { low: boolean; shortfall_milli: number | null; expiry: Expiry };

export function stockFlags(item: { quantity_milli: number; min_quantity_milli: number | null; expires_on: string | null }, today: string): StockFlags {
  return {
    low: isLow(item.quantity_milli, item.min_quantity_milli),
    shortfall_milli: shortfallMilli(item.quantity_milli, item.min_quantity_milli),
    expiry: expiryOf(item.expires_on, today),
  };
}

/**
 * Calories of one ingredient line. The stated number wins.
 * Otherwise the linked stock item, and only when the unit is the same.
 */
export function lineKcal(
  line: { quantity_milli: number; unit: FoodUnit; kcal: number | null },
  item: { unit: FoodUnit; kcal_per_100: number | null; kcal_each: number | null } | null,
): number | null {
  if (line.kcal !== null) return line.kcal;
  if (!item || item.unit !== line.unit) return null;
  if (line.unit === "un") return item.kcal_each === null ? null : Math.round((line.quantity_milli * item.kcal_each) / 1000);
  if (item.kcal_per_100 === null) return null;
  return Math.round((line.quantity_milli * item.kcal_per_100) / 100_000);
}

export function dishCalories(lines: readonly { name: string; kcal: number | null }[], servings: number): { known_kcal: number; missing: string[]; kcal_per_serving: number | null } {
  const missing = lines.filter((line) => line.kcal === null).map((line) => line.name);
  const known = lines.reduce((sum, line) => sum + (line.kcal ?? 0), 0);
  if (lines.length === 0 || missing.length > 0 || servings < 1) return { known_kcal: known, missing, kcal_per_serving: null };
  return { known_kcal: known, missing, kcal_per_serving: Math.round(known / servings) };
}

/** A portion of a dish whose per-serving calories are already known. */
export function scaledKcal(perServing: number, servingsMilli: number): number {
  return Math.round((perServing * servingsMilli) / 1000);
}

export function sumDay(meals: readonly { family_member_id: string | null; kcal: number }[]): { total: number; by_person: { family_member_id: string | null; kcal: number; meals: number }[] } {
  const byPerson: { family_member_id: string | null; kcal: number; meals: number }[] = [];
  for (const meal of meals) {
    const row = byPerson.find((candidate) => candidate.family_member_id === meal.family_member_id);
    if (row) {
      row.kcal += meal.kcal;
      row.meals += 1;
    } else {
      byPerson.push({ family_member_id: meal.family_member_id, kcal: meal.kcal, meals: 1 });
    }
  }
  return { total: meals.reduce((sum, meal) => sum + meal.kcal, 0), by_person: byPerson };
}

export function suggestShopping<T extends { id: string; name: string; unit: FoodUnit; quantity_milli: number; min_quantity_milli: number | null }>(
  items: readonly T[],
  openItemIds: ReadonlySet<string>,
): { food_item_id: string; name: string; unit: FoodUnit; quantity_milli: number | null }[] {
  const lines: { food_item_id: string; name: string; unit: FoodUnit; quantity_milli: number | null }[] = [];
  for (const item of items) {
    if (openItemIds.has(item.id) || !isLow(item.quantity_milli, item.min_quantity_milli)) continue;
    lines.push({ food_item_id: item.id, name: item.name, unit: item.unit, quantity_milli: shortfallMilli(item.quantity_milli, item.min_quantity_milli) });
  }
  return lines;
}

export function formatQuantity(milli: number, unit: FoodUnit): string {
  const text = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 3 }).format(milli / 1000);
  return `${text} ${unit}`;
}

function bad(details: FieldError[]): ParseResult<never> {
  return { ok: false, details };
}

function record(body: unknown): Record<string, unknown> | null {
  if (typeof body !== "object" || body === null || Array.isArray(body)) return null;
  return body as Record<string, unknown>;
}

function unknownFields(body: Record<string, unknown>, allowed: readonly string[], details: FieldError[]): void {
  for (const key of Object.keys(body)) if (!allowed.includes(key)) details.push({ field: key, message: "is not a known field" });
}

function readName(value: unknown, field: string, details: FieldError[], required: boolean): string | null {
  if (value === undefined || value === null || value === "") {
    if (required) details.push({ field, message: "is required" });
    return null;
  }
  if (typeof value !== "string") {
    details.push({ field, message: "must be a string" });
    return null;
  }
  const name = value.trim().replace(/\s+/g, " ");
  if (name.length < 1 || name.length > 80) details.push({ field, message: "must be 1 to 80 characters" });
  return name.length >= 1 && name.length <= 80 ? name : null;
}

function readUnit(value: unknown, field: string, details: FieldError[], required: boolean): FoodUnit | null {
  if (value === undefined || value === null || value === "") {
    if (required) details.push({ field, message: "must be g, ml or un" });
    return null;
  }
  if (typeof value !== "string" || !(FOOD_UNITS as readonly string[]).includes(value)) {
    details.push({ field, message: "must be g, ml or un" });
    return null;
  }
  return value as FoodUnit;
}

function readMilli(value: unknown, field: string, details: FieldError[], required: boolean, allowZero: boolean): number | null {
  if (value === undefined || value === null || value === "") {
    if (required) details.push({ field, message: "is required" });
    return null;
  }
  if (typeof value !== "number" || !Number.isFinite(value)) {
    details.push({ field, message: "must be a number" });
    return null;
  }
  if (value < 0 || (!allowZero && value === 0) || value > 1_000_000 || Math.abs(value * 1000 - Math.round(value * 1000)) > 1e-6) {
    details.push({ field, message: allowZero ? "must be from 0 to 1000000, with at most 3 decimals" : "must be greater than 0 and at most 1000000, with at most 3 decimals" });
    return null;
  }
  return Math.round(value * 1000);
}

function readKcal(value: unknown, field: string, details: FieldError[], max: number): number | null | undefined {
  if (value === undefined) return undefined;
  if (value === null) return null;
  if (typeof value !== "number" || !Number.isInteger(value) || value < 0 || value > max) {
    details.push({ field, message: `must be an integer from 0 to ${max}` });
    return undefined;
  }
  return value;
}

function readDate(value: unknown, field: string, details: FieldError[]): string | null | undefined {
  if (value === undefined) return undefined;
  if (value === null || value === "") return null;
  if (typeof value !== "string" || !isIsoDate(value)) {
    details.push({ field, message: "must be YYYY-MM-DD" });
    return undefined;
  }
  return value;
}

function readKey(value: unknown, details: FieldError[]): string | null {
  if (value === undefined || value === null || value === "") return null;
  if (typeof value !== "string" || value.trim().length === 0 || value.length > 200) {
    details.push({ field: "external_key", message: "must be a string of at most 200 characters" });
    return null;
  }
  return value.trim();
}

function readTacoId(value: unknown, field: string, details: FieldError[]): number | null | undefined {
  if (value === undefined) return undefined;
  if (value === null) return null;
  if (typeof value !== "number" || !Number.isInteger(value) || value < 1 || value > 9999) {
    details.push({ field, message: "must be a TACO id" });
    return undefined;
  }
  return value;
}

function readNotes(value: unknown, details: FieldError[]): string | null | undefined {
  if (value === undefined) return undefined;
  if (value === null || value === "") return null;
  if (typeof value !== "string" || value.trim().length > 500) {
    details.push({ field: "notes", message: "must be a string of at most 500 characters" });
    return undefined;
  }
  return value.trim();
}

function readServings(value: unknown, details: FieldError[], required: boolean): number | null {
  if (value === undefined || value === null || value === "") {
    if (required) details.push({ field: "servings", message: "must be an integer from 1 to 50" });
    return null;
  }
  if (typeof value !== "number" || !Number.isInteger(value) || value < 1 || value > 50) {
    details.push({ field: "servings", message: "must be an integer from 1 to 50" });
    return null;
  }
  return value;
}

function readUuid(value: unknown, field: string, details: FieldError[], required: boolean): string | null {
  if (value === undefined || value === null || value === "") {
    if (required) details.push({ field, message: "is required" });
    return null;
  }
  if (typeof value !== "string" || !isUuid(value)) {
    details.push({ field, message: "must be a uuid" });
    return null;
  }
  return value;
}

function readIngredients(value: unknown, details: FieldError[], required: boolean): IngredientDraft[] | undefined {
  if (value === undefined) {
    if (required) details.push({ field: "ingredients", message: "is required" });
    return undefined;
  }
  if (!Array.isArray(value) || value.length < 1 || value.length > 40) {
    details.push({ field: "ingredients", message: "must be 1 to 40 ingredients" });
    return undefined;
  }
  const lines: IngredientDraft[] = [];
  for (let index = 0; index < value.length; index += 1) {
    const row = record(value[index]);
    const field = `ingredients[${index}]`;
    if (!row) {
      details.push({ field, message: "must be an object" });
      continue;
    }
    unknownFields(row, ["name", "quantity", "unit", "food_item_id", "kcal", "taco_id"], details);
    const food_item_id = readUuid(row.food_item_id, `${field}.food_item_id`, details, false);
    const name = readName(row.name, `${field}.name`, details, !food_item_id);
    const quantity_milli = readMilli(row.quantity, `${field}.quantity`, details, true, false);
    const unit = readUnit(row.unit, `${field}.unit`, details, true);
    const stated = row.kcal === undefined ? null : readKcal(row.kcal, `${field}.kcal`, details, 20_000);
    const taco = readTacoId(row.taco_id, `${field}.taco_id`, details);
    if (stated === undefined || quantity_milli === null || !unit || taco === undefined && row.taco_id !== undefined) continue;
    const taco_id = taco ?? null;
    if (name) lines.push({ name, quantity_milli, unit, food_item_id, kcal: stated, taco_id });
    else if (food_item_id) lines.push({ name: null, quantity_milli, unit, food_item_id, kcal: stated, taco_id });
  }
  if (details.length > 0) return undefined;
  if (!lines || lines.length !== value.length) {
    details.push({ field: "ingredients", message: "each ingredient needs a name, a quantity and a unit" });
    return undefined;
  }
  return lines;
}

export function parseStockCreate(body: unknown): ParseResult<StockDraft> {
  const raw = record(body);
  if (!raw) return bad([{ field: "body", message: "must be a JSON object" }]);
  const details: FieldError[] = [];
  unknownFields(raw, CREATE_STOCK, details);
  const name = readName(raw.name, "name", details, true);
  const unit = readUnit(raw.unit, "unit", details, true);
  const quantity_milli = readMilli(raw.quantity, "quantity", details, true, true);
  const min = raw.min_quantity === undefined ? null : readMilli(raw.min_quantity, "min_quantity", details, false, true);
  const expires = raw.expires_on === undefined ? null : readDate(raw.expires_on, "expires_on", details);
  const kcal100 = raw.kcal_per_100 === undefined ? null : readKcal(raw.kcal_per_100, "kcal_per_100", details, 900);
  const each = raw.kcal_each === undefined ? null : readKcal(raw.kcal_each, "kcal_each", details, 5000);
  const external_key = readKey(raw.external_key, details);
  const taco = raw.taco_id === undefined ? null : readTacoId(raw.taco_id, "taco_id", details);
  if (details.length > 0 || !name || !unit || quantity_milli === null || kcal100 === undefined || each === undefined || expires === undefined || taco === undefined) {
    return bad(details.length > 0 ? details : [{ field: "body", message: "is invalid" }]);
  }
  const fit = kcalFits(unit, kcal100, each);
  if (fit) return bad([{ field: unit === "un" ? "kcal_per_100" : "kcal_each", message: fit }]);
  return { ok: true, value: { name, unit, quantity_milli, min_quantity_milli: min, expires_on: expires, kcal_per_100: kcal100, kcal_each: each, external_key, taco_id: taco } };
}

export function parseStockPatch(body: unknown): ParseResult<StockPatch> {
  const raw = record(body);
  if (!raw) return bad([{ field: "body", message: "must be a JSON object" }]);
  const details: FieldError[] = [];
  unknownFields(raw, PATCH_STOCK, details);
  const patch: StockPatch = {};
  if ("name" in raw) {
    const name = readName(raw.name, "name", details, true);
    if (name) patch.name = name;
  }
  if ("unit" in raw) {
    const unit = readUnit(raw.unit, "unit", details, true);
    if (unit) patch.unit = unit;
  }
  if ("quantity" in raw) {
    const quantity = readMilli(raw.quantity, "quantity", details, true, true);
    if (quantity !== null) patch.quantity_milli = quantity;
  }
  if ("min_quantity" in raw) patch.min_quantity_milli = raw.min_quantity === null ? null : readMilli(raw.min_quantity, "min_quantity", details, true, true);
  if ("expires_on" in raw) {
    const expires = readDate(raw.expires_on, "expires_on", details);
    if (expires !== undefined) patch.expires_on = expires;
  }
  if ("kcal_per_100" in raw) {
    const kcal = readKcal(raw.kcal_per_100, "kcal_per_100", details, 900);
    if (kcal !== undefined) patch.kcal_per_100 = kcal;
  }
  if ("kcal_each" in raw) {
    const kcal = readKcal(raw.kcal_each, "kcal_each", details, 5000);
    if (kcal !== undefined) patch.kcal_each = kcal;
  }
  if ("archived" in raw) {
    if (typeof raw.archived !== "boolean") details.push({ field: "archived", message: "must be true or false" });
    else patch.archived = raw.archived;
  }
  if ("taco_id" in raw) {
    const taco = readTacoId(raw.taco_id, "taco_id", details);
    if (taco !== undefined) patch.taco_id = taco;
  }
  if (details.length > 0) return bad(details);
  if (Object.keys(patch).length === 0) return bad([{ field: "body", message: "nothing to change" }]);
  return { ok: true, value: patch };
}

export function parseDishCreate(body: unknown): ParseResult<DishDraft> {
  const raw = record(body);
  if (!raw) return bad([{ field: "body", message: "must be a JSON object" }]);
  const details: FieldError[] = [];
  unknownFields(raw, DISH_FIELDS, details);
  const name = readName(raw.name, "name", details, true);
  const servings = raw.servings === undefined ? 1 : readServings(raw.servings, details, true);
  const notes = raw.notes === undefined ? null : readNotes(raw.notes, details);
  const ingredients = readIngredients(raw.ingredients, details, true);
  const external_key = readKey(raw.external_key, details);
  if (!name) return bad(details.some((item) => item.field === "name") ? details : [...details, { field: "name", message: "is required" }]);
  if (details.length > 0 || servings === null || notes === undefined || !ingredients) return bad(details);
  return { ok: true, value: { name, servings, notes, external_key, ingredients } };
}

export function parseDishPatch(body: unknown): ParseResult<DishPatch> {
  const raw = record(body);
  if (!raw) return bad([{ field: "body", message: "must be a JSON object" }]);
  const details: FieldError[] = [];
  unknownFields(raw, PATCH_DISH, details);
  const patch: DishPatch = {};
  if ("name" in raw) {
    const name = readName(raw.name, "name", details, true);
    if (name) patch.name = name;
  }
  if ("servings" in raw) {
    const servings = readServings(raw.servings, details, true);
    if (servings !== null) patch.servings = servings;
  }
  if ("notes" in raw) {
    const notes = readNotes(raw.notes, details);
    if (notes !== undefined) patch.notes = notes;
  }
  if ("archived" in raw) {
    if (typeof raw.archived !== "boolean") details.push({ field: "archived", message: "must be true or false" });
    else patch.archived = raw.archived;
  }
  if ("ingredients" in raw) {
    const ingredients = readIngredients(raw.ingredients, details, true);
    if (ingredients) patch.ingredients = ingredients;
  }
  if (details.length > 0) return bad(details);
  if (Object.keys(patch).length === 0) return bad([{ field: "body", message: "nothing to change" }]);
  return { ok: true, value: patch };
}

export function parseShoppingCreate(body: unknown): ParseResult<ShoppingDraft> {
  const raw = record(body);
  if (!raw) return bad([{ field: "body", message: "must be a JSON object" }]);
  const details: FieldError[] = [];
  unknownFields(raw, SHOPPING_FIELDS, details);
  const food_item_id = readUuid(raw.food_item_id, "food_item_id", details, false);
  const name = readName(raw.name, "name", details, !food_item_id);
  const quantity_milli = raw.quantity === undefined || raw.quantity === null ? null : readMilli(raw.quantity, "quantity", details, true, false);
  const unit = raw.unit === undefined || raw.unit === null ? null : readUnit(raw.unit, "unit", details, true);
  const external_key = readKey(raw.external_key, details);
  if ((quantity_milli === null) !== (unit === null) && raw.quantity !== undefined && raw.unit === undefined) {
    details.push({ field: "unit", message: "is required when quantity is set" });
  }
  if (raw.unit !== undefined && raw.unit !== null && quantity_milli === null && raw.quantity === undefined) {
    details.push({ field: "quantity", message: "is required when unit is set" });
  }
  if (details.length > 0) return bad(details);
  return { ok: true, value: { name, quantity_milli, unit, food_item_id, external_key } };
}

export function parseMealCreate(body: unknown, today: string): ParseResult<MealDraft> {
  const raw = record(body);
  if (!raw) return bad([{ field: "body", message: "must be a JSON object" }]);
  const details: FieldError[] = [];
  unknownFields(raw, MEAL_FIELDS, details);
  const eaten = readDate(raw.eaten_on, "eaten_on", details);
  const eaten_on = eaten === undefined || eaten === null ? today : eaten;
  if (eaten_on > today) details.push({ field: "eaten_on", message: "must not be a future day" });
  const family_member_id = readUuid(raw.family_member_id, "family_member_id", details, false);
  const dish_id = readUuid(raw.dish_id, "dish_id", details, false);
  const title = readName(raw.title, "title", details, !dish_id);
  const servings = raw.servings === undefined || raw.servings === null ? 1000 : readMilli(raw.servings, "servings", details, true, false);
  if (servings !== null && servings > 20_000) details.push({ field: "servings", message: "must be at most 20" });
  const kcal = raw.kcal === undefined ? null : readKcal(raw.kcal, "kcal", details, 20_000);
  const external_key = readKey(raw.external_key, details);
  if (!dish_id && kcal === null) details.push({ field: "kcal", message: "is required when there is no dish" });
  if (details.length > 0 || servings === null || kcal === undefined) return bad(details.length > 0 ? details : [{ field: "body", message: "is invalid" }]);
  return { ok: true, value: { eaten_on, family_member_id, dish_id, title, servings_milli: servings, kcal, external_key } };
}

export function parseFoodView(value: unknown): "estoque" | "pratos" | "compras" | "calorias" | null {
  if (value === "estoque" || value === "pratos" || value === "compras" || value === "calorias") return value;
  return null;
}

export function parseRestock(body: unknown): ParseResult<{ restock: boolean }> {
  const raw = record(body);
  if (!raw) return bad([{ field: "body", message: "must be a JSON object" }]);
  const details: FieldError[] = [];
  unknownFields(raw, ["restock"], details);
  if (raw.restock !== undefined && typeof raw.restock !== "boolean") details.push({ field: "restock", message: "must be true or false" });
  if (details.length > 0) return bad(details);
  return { ok: true, value: { restock: raw.restock === true } };
}
