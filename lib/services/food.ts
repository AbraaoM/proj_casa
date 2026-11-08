import { isUniqueViolation } from "@/lib/db/errors";
import type { Sql } from "@/lib/db/client";
import {
  dishCalories,
  foodSlug,
  fromMilli,
  kcalFits,
  lineKcal,
  nextSlug,
  scaledKcal,
  stockFlags,
  suggestShopping,
  sumDay,
  type DishDraft,
  type DishPatch,
  type Expiry,
  type FoodUnit,
  type IngredientDraft,
  type MealDraft,
  type ShoppingDraft,
  type StockDraft,
  type StockPatch,
} from "@/lib/domain/food";
import { applyTacoToStock, searchTaco, tacoById, tacoIngredientKcal, type TacoMatch } from "@/lib/domain/food/taco";
import { notFound, validationError } from "@/lib/errors";
import {
  addStockQuantity,
  dishByExternalKey,
  dishSlugs,
  familyExists,
  getDishRow,
  getShoppingRow,
  getStockRow,
  insertDish,
  insertMeal,
  insertShopping,
  insertStock,
  listDishRows,
  listMealRows,
  listShoppingRows,
  listStockRows,
  markShoppingBought,
  mealByExternalKey,
  openShoppingItemIds,
  patchDish,
  patchStock,
  replaceDishLines,
  shoppingByExternalKey,
  stockByExternalKey,
  stockSlugs,
  voidMeal,
  type DishRow,
  type MealRow,
  type ShoppingRow,
  type StockRow,
} from "@/lib/repositories/food";

export type StockView = StockRow & { low: boolean; shortfall_milli: number | null; expiry: Expiry };
export type DishView = {
  id: string;
  name: string;
  slug: string;
  servings: number;
  notes: string | null;
  archived: boolean;
  known_kcal: number;
  missing: string[];
  kcal_per_serving: number | null;
  ingredients: { name: string; quantity_milli: number; unit: FoodUnit; food_item_id: string | null; kcal: number | null; taco_id: number | null }[];
};

function viewStock(row: StockRow, today: string): StockView {
  return { ...row, ...stockFlags(row, today) };
}

function viewDish(row: DishRow): DishView {
  const ingredients = row.lines.map((line) => ({
    name: line.name,
    quantity_milli: line.quantity_milli,
    unit: line.unit,
    food_item_id: line.food_item_id,
    kcal: lineKcal(
      line,
      line.item_unit ? { unit: line.item_unit, kcal_per_100: line.item_kcal_per_100, kcal_each: line.item_kcal_each } : null,
    ),
    taco_id: line.taco_id,
  }));
  const calories = dishCalories(ingredients, row.servings);
  return { id: row.id, name: row.name, slug: row.slug, servings: row.servings, notes: row.notes, archived: row.archived, ingredients, ...calories };
}

export function presentStock(item: StockView) {
  return {
    id: item.id,
    name: item.name,
    slug: item.slug,
    unit: item.unit,
    quantity: fromMilli(item.quantity_milli),
    min_quantity: item.min_quantity_milli === null ? null : fromMilli(item.min_quantity_milli),
    expires_on: item.expires_on,
    kcal_per_100: item.kcal_per_100,
    kcal_each: item.kcal_each,
    low: item.low,
    shortfall: item.shortfall_milli === null ? null : fromMilli(item.shortfall_milli),
    expiry: item.expiry,
    taco_id: item.taco_id,
    taco_name: item.taco_id ? tacoById(item.taco_id)?.name ?? null : null,
    ...(item.archived ? { archived: true } : {}),
  };
}

export function presentDish(dish: DishView) {
  return {
    id: dish.id,
    name: dish.name,
    slug: dish.slug,
    servings: dish.servings,
    notes: dish.notes,
    kcal_per_serving: dish.kcal_per_serving,
    known_kcal: dish.known_kcal,
    missing: dish.missing,
    ...(dish.archived ? { archived: true } : {}),
    ingredients: dish.ingredients.map((line) => ({
      name: line.name,
      quantity: fromMilli(line.quantity_milli),
      unit: line.unit,
      food_item_id: line.food_item_id,
      kcal: line.kcal,
      taco_id: line.taco_id,
      taco_name: line.taco_id ? tacoById(line.taco_id)?.name ?? null : null,
    })),
  };
}

export function presentShopping(line: ShoppingRow) {
  return {
    id: line.id,
    name: line.name,
    quantity: line.quantity_milli === null ? null : fromMilli(line.quantity_milli),
    unit: line.unit,
    food_item_id: line.food_item_id,
    bought: line.bought_at !== null,
  };
}

export function presentMeal(meal: MealRow) {
  return {
    id: meal.id,
    eaten_on: meal.eaten_on,
    title: meal.title,
    kcal: meal.kcal,
    servings: fromMilli(meal.servings_milli),
    family_member_id: meal.family_member_id,
    person: meal.person_name,
    dish_id: meal.dish_id,
  };
}

export function presentDay(day: string, meals: MealRow[]) {
  const summed = sumDay(meals);
  return {
    date: day,
    total_kcal: summed.total,
    by_person: summed.by_person.map((row) => ({
      family_member_id: row.family_member_id,
      person: meals.find((meal) => meal.family_member_id === row.family_member_id)?.person_name ?? null,
      kcal: row.kcal,
      meals: row.meals,
    })),
    meals: meals.map(presentMeal),
  };
}

async function resolveLines(sql: Sql, lines: IngredientDraft[]): Promise<{ name: string; quantity_milli: number; unit: FoodUnit; food_item_id: string | null; kcal: number | null; taco_id: number | null }[]> {
  const resolved = [];
  for (const line of lines) {
    if (line.taco_id !== null && !tacoById(line.taco_id)) {
      throw validationError("taco_id was not found in TACO", [{ field: "ingredients", message: "was not found in TACO" }]);
    }
    const item = line.food_item_id ? await getStockRow(sql, line.food_item_id) : null;
    if (line.food_item_id && !item) throw notFound("Food item was not found.");
    const fromStock = lineKcal(line, item);
    const taco = fromStock === null ? tacoIngredientKcal(line) : null;
    const name = line.name ?? item?.name;
    if (!name) throw validationError("ingredient name is required", [{ field: "ingredients", message: "name is required" }]);
    resolved.push({
      name,
      quantity_milli: line.quantity_milli,
      unit: line.unit,
      food_item_id: item?.id ?? null,
      kcal: fromStock ?? taco?.kcal ?? null,
      taco_id: fromStock !== null ? item?.taco_id ?? line.taco_id : taco?.taco_id ?? null,
    });
  }
  return resolved;
}

export function dishTacoGaps(dish: DishView): { name: string; candidates: TacoMatch[] }[] {
  return dish.ingredients.filter((line) => line.kcal === null).map((line) => ({ name: line.name, candidates: searchTaco(line.name, 5) }));
}

export async function listStock(sql: Sql, today: string, includeArchived = false): Promise<StockView[]> {
  return (await listStockRows(sql, includeArchived)).map((row) => viewStock(row, today));
}

export async function readStock(sql: Sql, ref: string, today: string): Promise<StockView> {
  const row = await getStockRow(sql, ref);
  if (!row) throw notFound("Food item was not found.");
  return viewStock(row, today);
}

export async function createStock(sql: Sql, draft: StockDraft, today: string): Promise<{ item: StockView; idempotent_replay: boolean; taco_candidates: TacoMatch[] }> {
  if (draft.taco_id !== null && !tacoById(draft.taco_id)) {
    throw validationError("taco_id was not found in TACO", [{ field: "taco_id", message: "was not found in TACO" }]);
  }
  const filled = applyTacoToStock(draft);
  const candidates = filled.taco_id === null && filled.kcal_per_100 === null && filled.kcal_each === null ? searchTaco(draft.name, 5) : [];
  if (draft.external_key) {
    const existing = await stockByExternalKey(sql, draft.external_key);
    if (existing) return { item: viewStock(existing, today), idempotent_replay: true, taco_candidates: [] };
  }
  const slug = nextSlug(foodSlug(draft.name), new Set(await stockSlugs(sql)));
  try {
    const id = await insertStock(sql, { ...filled, slug });
    const item = await getStockRow(sql, id);
    if (!item) throw new Error("Inserted food item could not be read back.");
    return { item: viewStock(item, today), idempotent_replay: false, taco_candidates: candidates };
  } catch (error) {
    if (draft.external_key && isUniqueViolation(error)) {
      const existing = await stockByExternalKey(sql, draft.external_key);
      if (existing) return { item: viewStock(existing, today), idempotent_replay: true, taco_candidates: [] };
    }
    throw error;
  }
}

export async function updateStock(sql: Sql, ref: string, patch: StockPatch, today: string): Promise<StockView> {
  const current = await getStockRow(sql, ref);
  if (!current) throw notFound("Food item was not found.");
  const next = { ...patch };
  if (patch.taco_id) {
    const food = tacoById(patch.taco_id);
    if (!food) throw validationError("taco_id was not found in TACO", [{ field: "taco_id", message: "was not found in TACO" }]);
    const unit = patch.unit ?? current.unit;
    if (patch.kcal_per_100 === undefined && patch.kcal_each === undefined) {
      if (unit === "un" && food.piece_grams !== null) {
        next.kcal_each = Math.round((food.kcal_per_100 * food.piece_grams) / 100);
        next.kcal_per_100 = null;
      } else if (unit !== "un") {
        next.kcal_per_100 = food.kcal_per_100;
        next.kcal_each = null;
      }
    }
  }
  const unit = next.unit ?? current.unit;
  const kcalPer100 = next.kcal_per_100 === undefined ? current.kcal_per_100 : next.kcal_per_100;
  const kcalEach = next.kcal_each === undefined ? current.kcal_each : next.kcal_each;
  const fit = kcalFits(unit, kcalPer100, kcalEach);
  if (fit) throw validationError(fit, [{ field: unit === "un" ? "kcal_per_100" : "kcal_each", message: fit }]);
  await patchStock(sql, current.id, next);
  const saved = await getStockRow(sql, current.id);
  if (!saved) throw notFound("Food item was not found.");
  return viewStock(saved, today);
}

export async function listDishes(sql: Sql, includeArchived = false): Promise<DishView[]> {
  return (await listDishRows(sql, includeArchived)).map(viewDish);
}

export async function readDish(sql: Sql, ref: string): Promise<DishView> {
  const row = await getDishRow(sql, ref);
  if (!row) throw notFound("Dish was not found.");
  return viewDish(row);
}

export async function createDish(sql: Sql, draft: DishDraft): Promise<{ dish: DishView; idempotent_replay: boolean; taco_candidates: { name: string; candidates: TacoMatch[] }[] }> {
  if (draft.external_key) {
    const existing = await dishByExternalKey(sql, draft.external_key);
    if (existing) return { dish: viewDish(existing), idempotent_replay: true, taco_candidates: [] };
  }
  const lines = await resolveLines(sql, draft.ingredients);
  const slug = nextSlug(foodSlug(draft.name), new Set(await dishSlugs(sql)));
  try {
    const id = await insertDish(sql, { name: draft.name, slug, servings: draft.servings, notes: draft.notes, external_key: draft.external_key });
    await replaceDishLines(sql, id, lines);
    const dish = await readDish(sql, id);
    return { dish, idempotent_replay: false, taco_candidates: dishTacoGaps(dish) };
  } catch (error) {
    if (draft.external_key && isUniqueViolation(error)) {
      const existing = await dishByExternalKey(sql, draft.external_key);
      if (existing) return { dish: viewDish(existing), idempotent_replay: true, taco_candidates: [] };
    }
    throw error;
  }
}

export async function updateDish(sql: Sql, ref: string, patch: DishPatch): Promise<DishView> {
  const current = await getDishRow(sql, ref);
  if (!current) throw notFound("Dish was not found.");
  const lines = patch.ingredients ? await resolveLines(sql, patch.ingredients) : null;
  await patchDish(sql, current.id, patch);
  if (lines) await replaceDishLines(sql, current.id, lines);
  return readDish(sql, current.id);
}

export async function listShopping(sql: Sql, includeBought = false): Promise<ShoppingRow[]> {
  return listShoppingRows(sql, includeBought);
}

export async function addShopping(sql: Sql, draft: ShoppingDraft): Promise<{ line: ShoppingRow; idempotent_replay: boolean }> {
  if (draft.external_key) {
    const existing = await shoppingByExternalKey(sql, draft.external_key);
    if (existing) return { line: existing, idempotent_replay: true };
  }
  const item = draft.food_item_id ? await getStockRow(sql, draft.food_item_id) : null;
  if (draft.food_item_id && !item) throw notFound("Food item was not found.");
  const name = draft.name ?? item?.name;
  if (!name) throw validationError("name is required", [{ field: "name", message: "is required" }]);
  const unit = draft.unit ?? (draft.quantity_milli !== null ? item?.unit ?? null : null);
  if (draft.quantity_milli !== null && !unit) throw validationError("unit is required when quantity is set", [{ field: "unit", message: "is required when quantity is set" }]);
  if (item && (await openShoppingItemIds(sql)).includes(item.id)) {
    const open = (await listShoppingRows(sql, false)).find((line) => line.food_item_id === item.id);
    if (open) return { line: open, idempotent_replay: true };
  }
  try {
    const id = await insertShopping(sql, { name, quantity_milli: draft.quantity_milli, unit, food_item_id: item?.id ?? null, external_key: draft.external_key });
    const line = await getShoppingRow(sql, id);
    if (!line) throw new Error("Inserted shopping line could not be read back.");
    return { line, idempotent_replay: false };
  } catch (error) {
    if (isUniqueViolation(error)) {
      if (draft.external_key) {
        const existing = await shoppingByExternalKey(sql, draft.external_key);
        if (existing) return { line: existing, idempotent_replay: true };
      }
      if (item) {
        const open = (await listShoppingRows(sql, false)).find((line) => line.food_item_id === item.id);
        if (open) return { line: open, idempotent_replay: true };
      }
    }
    throw error;
  }
}

export async function buyShopping(sql: Sql, id: string, restock: boolean): Promise<{ line: ShoppingRow; already: boolean }> {
  const current = await getShoppingRow(sql, id);
  if (!current) throw notFound("Shopping line was not found.");
  if (current.bought_at) return { line: current, already: true };
  const bought = await markShoppingBought(sql, current.id);
  if (bought && restock && current.food_item_id && current.quantity_milli) await addStockQuantity(sql, current.food_item_id, current.quantity_milli);
  const line = await getShoppingRow(sql, current.id);
  if (!line) throw notFound("Shopping line was not found.");
  return { line, already: !bought };
}

export async function generateShopping(sql: Sql, today: string): Promise<{ added: ShoppingRow[] }> {
  const stock = await listStock(sql, today, false);
  const open = new Set(await openShoppingItemIds(sql));
  const suggestions = suggestShopping(stock, open);
  const added: ShoppingRow[] = [];
  for (const suggestion of suggestions) {
    const result = await addShopping(sql, { name: suggestion.name, quantity_milli: suggestion.quantity_milli, unit: suggestion.quantity_milli === null ? null : suggestion.unit, food_item_id: suggestion.food_item_id, external_key: null });
    if (!result.idempotent_replay) added.push(result.line);
  }
  return { added };
}

export async function dayMeals(sql: Sql, day: string): Promise<MealRow[]> {
  return listMealRows(sql, day);
}

export async function logMeal(sql: Sql, draft: MealDraft): Promise<{ meal: MealRow; idempotent_replay: boolean }> {
  if (draft.external_key) {
    const existing = await mealByExternalKey(sql, draft.external_key);
    if (existing) return { meal: existing, idempotent_replay: true };
  }
  if (draft.family_member_id && !(await familyExists(sql, draft.family_member_id))) throw notFound("Family member was not found.");
  let title = draft.title;
  let kcal = draft.kcal;
  let dishId: string | null = null;
  if (draft.dish_id) {
    const dish = await readDish(sql, draft.dish_id);
    dishId = dish.id;
    title = title ?? dish.name;
    if (kcal === null) {
      if (dish.kcal_per_serving === null) {
        throw validationError("This dish has no complete calorie count. Pass kcal, or set calories on the ingredients.", [
          { field: "kcal", message: `missing: ${dish.missing.join(", ") || "ingredients"}` },
        ]);
      }
      kcal = scaledKcal(dish.kcal_per_serving, draft.servings_milli);
    }
  }
  if (!title || kcal === null) throw validationError("title and kcal are required", [{ field: "kcal", message: "is required when there is no dish" }]);
  try {
    const id = await insertMeal(sql, { eaten_on: draft.eaten_on, family_member_id: draft.family_member_id, dish_id: dishId, title, servings_milli: draft.servings_milli, kcal, external_key: draft.external_key });
    const meal = (await listMealRows(sql, draft.eaten_on)).find((row) => row.id === id);
    if (!meal) throw new Error("Inserted meal could not be read back.");
    return { meal, idempotent_replay: false };
  } catch (error) {
    if (draft.external_key && isUniqueViolation(error)) {
      const existing = await mealByExternalKey(sql, draft.external_key);
      if (existing) return { meal: existing, idempotent_replay: true };
    }
    throw error;
  }
}

export async function cancelMeal(sql: Sql, id: string): Promise<{ voided: boolean }> {
  const voided = await voidMeal(sql, id);
  if (!voided) {
    const rows = await sql.query<{ id: string }>("SELECT id::text FROM food_meals WHERE id = $1::uuid", [id]);
    if (rows.length === 0) throw notFound("Meal was not found.");
  }
  return { voided };
}

export async function loadFoodBoard(sql: Sql, today: string) {
  const [stock, dishes, shopping, meals] = await Promise.all([listStock(sql, today), listDishes(sql), listShopping(sql, false), dayMeals(sql, today)]);
  const openIds = new Set(shopping.map((line) => line.food_item_id).filter((id): id is string => id !== null));
  return { today, stock, dishes, shopping, day: presentDay(today, meals), low_to_list: suggestShopping(stock, openIds).length };
}
