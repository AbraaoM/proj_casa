import type { Sql } from "@/lib/db/client";
import type { FoodUnit } from "@/lib/domain/food";

export type StockRow = {
  id: string;
  name: string;
  slug: string;
  unit: FoodUnit;
  quantity_milli: number;
  min_quantity_milli: number | null;
  expires_on: string | null;
  kcal_per_100: number | null;
  kcal_each: number | null;
  external_key: string | null;
  archived: boolean;
};

export type DishLineRow = {
  name: string;
  quantity_milli: number;
  unit: FoodUnit;
  food_item_id: string | null;
  kcal: number | null;
  item_unit: FoodUnit | null;
  item_kcal_per_100: number | null;
  item_kcal_each: number | null;
};

export type DishRow = {
  id: string;
  name: string;
  slug: string;
  servings: number;
  notes: string | null;
  external_key: string | null;
  archived: boolean;
  lines: DishLineRow[];
};

export type ShoppingRow = {
  id: string;
  name: string;
  quantity_milli: number | null;
  unit: FoodUnit | null;
  food_item_id: string | null;
  bought_at: string | null;
  external_key: string | null;
};

export type MealRow = {
  id: string;
  eaten_on: string;
  family_member_id: string | null;
  person_name: string | null;
  dish_id: string | null;
  title: string;
  servings_milli: number;
  kcal: number;
  external_key: string | null;
};

function n(value: unknown): number {
  return typeof value === "number" ? value : Number(value);
}

function nOrNull(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  return n(value);
}

function stockFrom(row: Record<string, unknown>): StockRow {
  return {
    id: String(row.id),
    name: String(row.name),
    slug: String(row.slug),
    unit: row.unit as FoodUnit,
    quantity_milli: n(row.quantity_milli),
    min_quantity_milli: nOrNull(row.min_quantity_milli),
    expires_on: row.expires_on === null || row.expires_on === undefined ? null : String(row.expires_on).slice(0, 10),
    kcal_per_100: nOrNull(row.kcal_per_100),
    kcal_each: nOrNull(row.kcal_each),
    external_key: row.external_key === null || row.external_key === undefined ? null : String(row.external_key),
    archived: row.archived_at !== null && row.archived_at !== undefined,
  };
}

const STOCK_SQL = `
  SELECT id::text, name, slug, unit, quantity_milli, min_quantity_milli, expires_on::text,
         kcal_per_100, kcal_each, external_key, archived_at
  FROM food_items
`;

export async function listStockRows(sql: Sql, includeArchived: boolean): Promise<StockRow[]> {
  const rows = await sql.query<Record<string, unknown>>(
    `${STOCK_SQL} WHERE ($1::boolean OR archived_at IS NULL) ORDER BY name`,
    [includeArchived],
  );
  return rows.map(stockFrom);
}

export async function getStockRow(sql: Sql, ref: string): Promise<StockRow | null> {
  const rows = await sql.query<Record<string, unknown>>(`${STOCK_SQL} WHERE id::text = $1 OR slug = $1`, [ref]);
  return rows[0] ? stockFrom(rows[0]) : null;
}

export async function stockByExternalKey(sql: Sql, key: string): Promise<StockRow | null> {
  const rows = await sql.query<Record<string, unknown>>(`${STOCK_SQL} WHERE external_key = $1`, [key]);
  return rows[0] ? stockFrom(rows[0]) : null;
}

export async function stockSlugs(sql: Sql): Promise<string[]> {
  const rows = await sql.query<{ slug: string }>("SELECT slug FROM food_items");
  return rows.map((row) => row.slug);
}

export async function insertStock(
  sql: Sql,
  input: {
    name: string;
    slug: string;
    unit: FoodUnit;
    quantity_milli: number;
    min_quantity_milli: number | null;
    expires_on: string | null;
    kcal_per_100: number | null;
    kcal_each: number | null;
    external_key: string | null;
  },
): Promise<string> {
  const rows = await sql.query<{ id: string }>(
    `INSERT INTO food_items (name, slug, unit, quantity_milli, min_quantity_milli, expires_on, kcal_per_100, kcal_each, external_key)
     VALUES ($1, $2, $3, $4, $5, $6::date, $7, $8, $9)
     RETURNING id::text`,
    [input.name, input.slug, input.unit, input.quantity_milli, input.min_quantity_milli, input.expires_on, input.kcal_per_100, input.kcal_each, input.external_key],
  );
  const id = rows[0]?.id;
  if (!id) throw new Error("Insert did not return a food item id.");
  return id;
}

export async function patchStock(sql: Sql, id: string, patch: Record<string, unknown>): Promise<void> {
  const sets: string[] = [];
  const params: unknown[] = [];
  const add = (column: string, value: unknown, cast = "") => {
    params.push(value);
    sets.push(`${column} = $${params.length}${cast}`);
  };
  if ("name" in patch) add("name", patch.name);
  if ("unit" in patch) add("unit", patch.unit);
  if ("quantity_milli" in patch) add("quantity_milli", patch.quantity_milli);
  if ("min_quantity_milli" in patch) add("min_quantity_milli", patch.min_quantity_milli);
  if ("expires_on" in patch) add("expires_on", patch.expires_on, "::date");
  if ("kcal_per_100" in patch) add("kcal_per_100", patch.kcal_per_100);
  if ("kcal_each" in patch) add("kcal_each", patch.kcal_each);
  if ("archived" in patch) add("archived_at", patch.archived ? new Date().toISOString() : null);
  if (sets.length === 0) return;
  params.push(id);
  sets.push("updated_at = now()");
  await sql.query(`UPDATE food_items SET ${sets.join(", ")} WHERE id = $${params.length}::uuid`, params);
}

export async function addStockQuantity(sql: Sql, id: string, milli: number): Promise<void> {
  await sql.query("UPDATE food_items SET quantity_milli = quantity_milli + $2, updated_at = now() WHERE id = $1::uuid", [id, milli]);
}

const DISH_SQL = `
  SELECT d.id::text AS id, d.name, d.slug, d.servings, d.notes, d.external_key, d.archived_at,
         l.position, l.name AS line_name, l.quantity_milli, l.unit, l.food_item_id::text AS food_item_id, l.kcal,
         i.unit AS item_unit, i.kcal_per_100 AS item_kcal_per_100, i.kcal_each AS item_kcal_each
  FROM food_dishes d
  LEFT JOIN food_dish_lines l ON l.dish_id = d.id
  LEFT JOIN food_items i ON i.id = l.food_item_id
`;

function groupDishes(rows: Record<string, unknown>[]): DishRow[] {
  const dishes: DishRow[] = [];
  for (const row of rows) {
    let dish = dishes.find((candidate) => candidate.id === String(row.id));
    if (!dish) {
      dish = {
        id: String(row.id),
        name: String(row.name),
        slug: String(row.slug),
        servings: n(row.servings),
        notes: row.notes === null || row.notes === undefined ? null : String(row.notes),
        external_key: row.external_key === null || row.external_key === undefined ? null : String(row.external_key),
        archived: row.archived_at !== null && row.archived_at !== undefined,
        lines: [],
      };
      dishes.push(dish);
    }
    if (row.line_name === null || row.line_name === undefined) continue;
    dish.lines.push({
      name: String(row.line_name),
      quantity_milli: n(row.quantity_milli),
      unit: row.unit as FoodUnit,
      food_item_id: row.food_item_id === null || row.food_item_id === undefined ? null : String(row.food_item_id),
      kcal: nOrNull(row.kcal),
      item_unit: row.item_unit === null || row.item_unit === undefined ? null : (row.item_unit as FoodUnit),
      item_kcal_per_100: nOrNull(row.item_kcal_per_100),
      item_kcal_each: nOrNull(row.item_kcal_each),
    });
  }
  return dishes;
}

export async function listDishRows(sql: Sql, includeArchived: boolean): Promise<DishRow[]> {
  const rows = await sql.query<Record<string, unknown>>(
    `${DISH_SQL} WHERE ($1::boolean OR d.archived_at IS NULL) ORDER BY d.name, l.position`,
    [includeArchived],
  );
  return groupDishes(rows);
}

export async function getDishRow(sql: Sql, ref: string): Promise<DishRow | null> {
  const rows = await sql.query<Record<string, unknown>>(`${DISH_SQL} WHERE d.id::text = $1 OR d.slug = $1 ORDER BY l.position`, [ref]);
  return groupDishes(rows)[0] ?? null;
}

export async function dishByExternalKey(sql: Sql, key: string): Promise<DishRow | null> {
  const rows = await sql.query<Record<string, unknown>>(`${DISH_SQL} WHERE d.external_key = $1 ORDER BY l.position`, [key]);
  return groupDishes(rows)[0] ?? null;
}

export async function dishSlugs(sql: Sql): Promise<string[]> {
  const rows = await sql.query<{ slug: string }>("SELECT slug FROM food_dishes");
  return rows.map((row) => row.slug);
}

export async function insertDish(
  sql: Sql,
  input: { name: string; slug: string; servings: number; notes: string | null; external_key: string | null },
): Promise<string> {
  const rows = await sql.query<{ id: string }>(
    `INSERT INTO food_dishes (name, slug, servings, notes, external_key) VALUES ($1, $2, $3, $4, $5) RETURNING id::text`,
    [input.name, input.slug, input.servings, input.notes, input.external_key],
  );
  const id = rows[0]?.id;
  if (!id) throw new Error("Insert did not return a dish id.");
  return id;
}

export async function replaceDishLines(
  sql: Sql,
  dishId: string,
  lines: { name: string; quantity_milli: number; unit: FoodUnit; food_item_id: string | null; kcal: number | null }[],
): Promise<void> {
  await sql.query("DELETE FROM food_dish_lines WHERE dish_id = $1::uuid", [dishId]);
  for (let position = 0; position < lines.length; position += 1) {
    const line = lines[position]!;
    await sql.query(
      `INSERT INTO food_dish_lines (dish_id, position, name, quantity_milli, unit, food_item_id, kcal)
       VALUES ($1::uuid, $2, $3, $4, $5, $6::uuid, $7)`,
      [dishId, position, line.name, line.quantity_milli, line.unit, line.food_item_id, line.kcal],
    );
  }
}

export async function patchDish(sql: Sql, id: string, patch: { name?: string; servings?: number; notes?: string | null; archived?: boolean }): Promise<void> {
  const sets: string[] = [];
  const params: unknown[] = [];
  const add = (column: string, value: unknown) => {
    params.push(value);
    sets.push(`${column} = $${params.length}`);
  };
  if (patch.name !== undefined) add("name", patch.name);
  if (patch.servings !== undefined) add("servings", patch.servings);
  if (patch.notes !== undefined) add("notes", patch.notes);
  if (patch.archived !== undefined) add("archived_at", patch.archived ? new Date().toISOString() : null);
  if (sets.length === 0) return;
  params.push(id);
  sets.push("updated_at = now()");
  await sql.query(`UPDATE food_dishes SET ${sets.join(", ")} WHERE id = $${params.length}::uuid`, params);
}

export async function listShoppingRows(sql: Sql, includeBought: boolean): Promise<ShoppingRow[]> {
  const rows = await sql.query<Record<string, unknown>>(
    `SELECT id::text, name, quantity_milli, unit, food_item_id::text, bought_at, external_key
     FROM food_shopping
     WHERE ($1::boolean OR bought_at IS NULL)
     ORDER BY bought_at IS NULL DESC, created_at`,
    [includeBought],
  );
  return rows.map((row) => ({
    id: String(row.id),
    name: String(row.name),
    quantity_milli: nOrNull(row.quantity_milli),
    unit: row.unit === null || row.unit === undefined ? null : (row.unit as FoodUnit),
    food_item_id: row.food_item_id === null || row.food_item_id === undefined ? null : String(row.food_item_id),
    bought_at: row.bought_at === null || row.bought_at === undefined ? null : String(row.bought_at),
    external_key: row.external_key === null || row.external_key === undefined ? null : String(row.external_key),
  }));
}

export async function shoppingByExternalKey(sql: Sql, key: string): Promise<ShoppingRow | null> {
  const rows = await listShoppingRows(sql, true);
  return rows.find((row) => row.external_key === key) ?? null;
}

export async function getShoppingRow(sql: Sql, id: string): Promise<ShoppingRow | null> {
  const rows = await sql.query<Record<string, unknown>>(
    `SELECT id::text, name, quantity_milli, unit, food_item_id::text, bought_at, external_key FROM food_shopping WHERE id = $1::uuid`,
    [id],
  );
  const row = rows[0];
  if (!row) return null;
  return {
    id: String(row.id),
    name: String(row.name),
    quantity_milli: nOrNull(row.quantity_milli),
    unit: row.unit === null || row.unit === undefined ? null : (row.unit as FoodUnit),
    food_item_id: row.food_item_id === null || row.food_item_id === undefined ? null : String(row.food_item_id),
    bought_at: row.bought_at === null || row.bought_at === undefined ? null : String(row.bought_at),
    external_key: row.external_key === null || row.external_key === undefined ? null : String(row.external_key),
  };
}

export async function insertShopping(
  sql: Sql,
  input: { name: string; quantity_milli: number | null; unit: FoodUnit | null; food_item_id: string | null; external_key: string | null },
): Promise<string> {
  const rows = await sql.query<{ id: string }>(
    `INSERT INTO food_shopping (name, quantity_milli, unit, food_item_id, external_key) VALUES ($1, $2, $3, $4::uuid, $5) RETURNING id::text`,
    [input.name, input.quantity_milli, input.unit, input.food_item_id, input.external_key],
  );
  const id = rows[0]?.id;
  if (!id) throw new Error("Insert did not return a shopping line id.");
  return id;
}

export async function markShoppingBought(sql: Sql, id: string): Promise<boolean> {
  const rows = await sql.query<{ id: string }>("UPDATE food_shopping SET bought_at = now() WHERE id = $1::uuid AND bought_at IS NULL RETURNING id::text", [id]);
  return rows.length > 0;
}

export async function openShoppingItemIds(sql: Sql): Promise<string[]> {
  const rows = await sql.query<{ food_item_id: string }>("SELECT food_item_id::text FROM food_shopping WHERE bought_at IS NULL AND food_item_id IS NOT NULL");
  return rows.map((row) => row.food_item_id);
}

export async function listMealRows(sql: Sql, day: string): Promise<MealRow[]> {
  const rows = await sql.query<Record<string, unknown>>(
    `SELECT m.id::text, m.eaten_on::text, m.family_member_id::text, f.name AS person_name, m.dish_id::text,
            m.title, m.servings_milli, m.kcal, m.external_key
     FROM food_meals m
     LEFT JOIN family_members f ON f.id = m.family_member_id
     WHERE m.eaten_on = $1::date AND m.voided_at IS NULL
     ORDER BY m.created_at`,
    [day],
  );
  return rows.map((row) => ({
    id: String(row.id),
    eaten_on: String(row.eaten_on).slice(0, 10),
    family_member_id: row.family_member_id === null || row.family_member_id === undefined ? null : String(row.family_member_id),
    person_name: row.person_name === null || row.person_name === undefined ? null : String(row.person_name),
    dish_id: row.dish_id === null || row.dish_id === undefined ? null : String(row.dish_id),
    title: String(row.title),
    servings_milli: n(row.servings_milli),
    kcal: n(row.kcal),
    external_key: row.external_key === null || row.external_key === undefined ? null : String(row.external_key),
  }));
}

export async function mealByExternalKey(sql: Sql, key: string): Promise<MealRow | null> {
  const rows = await sql.query<Record<string, unknown>>(
    `SELECT m.id::text, m.eaten_on::text, m.family_member_id::text, f.name AS person_name, m.dish_id::text,
            m.title, m.servings_milli, m.kcal, m.external_key
     FROM food_meals m
     LEFT JOIN family_members f ON f.id = m.family_member_id
     WHERE m.external_key = $1 AND m.voided_at IS NULL`,
    [key],
  );
  const row = rows[0];
  if (!row) return null;
  return {
    id: String(row.id),
    eaten_on: String(row.eaten_on).slice(0, 10),
    family_member_id: row.family_member_id === null || row.family_member_id === undefined ? null : String(row.family_member_id),
    person_name: row.person_name === null || row.person_name === undefined ? null : String(row.person_name),
    dish_id: row.dish_id === null || row.dish_id === undefined ? null : String(row.dish_id),
    title: String(row.title),
    servings_milli: n(row.servings_milli),
    kcal: n(row.kcal),
    external_key: key,
  };
}

export async function insertMeal(
  sql: Sql,
  input: { eaten_on: string; family_member_id: string | null; dish_id: string | null; title: string; servings_milli: number; kcal: number; external_key: string | null },
): Promise<string> {
  const rows = await sql.query<{ id: string }>(
    `INSERT INTO food_meals (eaten_on, family_member_id, dish_id, title, servings_milli, kcal, external_key)
     VALUES ($1::date, $2::uuid, $3::uuid, $4, $5, $6, $7) RETURNING id::text`,
    [input.eaten_on, input.family_member_id, input.dish_id, input.title, input.servings_milli, input.kcal, input.external_key],
  );
  const id = rows[0]?.id;
  if (!id) throw new Error("Insert did not return a meal id.");
  return id;
}

export async function voidMeal(sql: Sql, id: string): Promise<boolean> {
  const rows = await sql.query<{ id: string }>(
    `UPDATE food_meals
     SET voided_at = now(),
         external_key = CASE WHEN external_key IS NULL THEN NULL ELSE external_key || '~voided~' || id::text END
     WHERE id = $1::uuid AND voided_at IS NULL
     RETURNING id::text`,
    [id],
  );
  return rows.length > 0;
}

export async function familyExists(sql: Sql, id: string): Promise<boolean> {
  const rows = await sql.query<{ id: string }>("SELECT id::text FROM family_members WHERE id = $1::uuid AND archived_at IS NULL", [id]);
  return rows.length > 0;
}
