import { describe, expect, it } from "vitest";
import {
  dishCalories,
  foodSlug,
  formatQuantity,
  lineKcal,
  nextSlug,
  parseDishCreate,
  parseMealCreate,
  parseShoppingCreate,
  parseStockCreate,
  parseStockPatch,
  scaledKcal,
  stockFlags,
  suggestShopping,
  sumDay,
} from "@/lib/domain/food";

const rice = { unit: "g" as const, kcal_per_100: 130, kcal_each: null };
const egg = { unit: "un" as const, kcal_per_100: null, kcal_each: 78 };

describe("food calories and stock", () => {
  it("uses the stated calories, otherwise the stock item of the same unit", () => {
    expect(lineKcal({ quantity_milli: 100_000, unit: "g", kcal: null }, rice)).toBe(130);
    expect(lineKcal({ quantity_milli: 2_000, unit: "un", kcal: null }, egg)).toBe(156);
    expect(lineKcal({ quantity_milli: 100_000, unit: "g", kcal: 90 }, rice)).toBe(90);
    expect(lineKcal({ quantity_milli: 100_000, unit: "ml", kcal: null }, rice)).toBeNull();
    expect(lineKcal({ quantity_milli: 100_000, unit: "g", kcal: null }, null)).toBeNull();
  });

  it("publishes a per-serving total only when every ingredient is known", () => {
    const full = dishCalories(
      [
        { name: "arroz", kcal: 130 },
        { name: "ovo", kcal: 156 },
      ],
      2,
    );
    expect(full).toEqual({ known_kcal: 286, missing: [], kcal_per_serving: 143 });
    const partial = dishCalories(
      [
        { name: "arroz", kcal: 130 },
        { name: "ovo", kcal: null },
      ],
      2,
    );
    expect(partial.kcal_per_serving).toBeNull();
    expect(partial.missing).toEqual(["ovo"]);
    expect(scaledKcal(143, 1_500)).toBe(215);
  });

  it("flags low stock, expiry and what the shopping list should add", () => {
    expect(stockFlags({ quantity_milli: 200_000, min_quantity_milli: 500_000, expires_on: "2026-11-08" }, "2026-11-08").low).toBe(true);
    expect(stockFlags({ quantity_milli: 200_000, min_quantity_milli: 500_000, expires_on: "2026-11-08" }, "2026-11-08").shortfall_milli).toBe(300_000);
    expect(stockFlags({ quantity_milli: 500_000, min_quantity_milli: 500_000, expires_on: null }, "2026-11-08")).toMatchObject({ low: true, shortfall_milli: null });
    expect(stockFlags({ quantity_milli: 800_000, min_quantity_milli: 500_000, expires_on: "2026-11-12" }, "2026-11-08").low).toBe(false);
    expect(stockFlags({ quantity_milli: 1, min_quantity_milli: null, expires_on: "2026-11-07" }, "2026-11-08").expiry).toBe("expired");
    expect(stockFlags({ quantity_milli: 1, min_quantity_milli: null, expires_on: "2026-11-11" }, "2026-11-08").expiry).toBe("soon");
    expect(stockFlags({ quantity_milli: 1, min_quantity_milli: null, expires_on: "2026-12-01" }, "2026-11-08").expiry).toBe("ok");

    const items = [
      { id: "a", name: "Arroz", unit: "g" as const, quantity_milli: 200_000, min_quantity_milli: 500_000 },
      { id: "b", name: "Feijão", unit: "g" as const, quantity_milli: 100_000, min_quantity_milli: 100_000 },
      { id: "c", name: "Ovo", unit: "un" as const, quantity_milli: 12_000, min_quantity_milli: 6_000 },
    ];
    expect(suggestShopping(items, new Set(["b"]))).toEqual([{ food_item_id: "a", name: "Arroz", unit: "g", quantity_milli: 300_000 }]);
    expect(suggestShopping(items, new Set())).toEqual([
      { food_item_id: "a", name: "Arroz", unit: "g", quantity_milli: 300_000 },
      { food_item_id: "b", name: "Feijão", unit: "g", quantity_milli: null },
    ]);
  });

  it("sums a day by person and keeps a meal without a person on its own", () => {
    const day = sumDay([
      { family_member_id: "p1", kcal: 400 },
      { family_member_id: null, kcal: 100 },
      { family_member_id: "p1", kcal: 150 },
    ]);
    expect(day.total).toBe(650);
    expect(day.by_person).toEqual([
      { family_member_id: "p1", kcal: 550, meals: 2 },
      { family_member_id: null, kcal: 100, meals: 1 },
    ]);
  });

  it("rejects a unit the kitchen does not use and calories on the wrong basis", () => {
    expect(parseStockCreate({ name: "Arroz", unit: "kg", quantity: 1 }).ok).toBe(false);
    expect(parseStockCreate({ name: "Arroz", unit: "g", quantity: 500, kcal_each: 10 }).ok).toBe(false);
    expect(parseStockCreate({ name: "Ovo", unit: "un", quantity: 12, kcal_per_100: 80 }).ok).toBe(false);
    const created = parseStockCreate({ name: "  Arroz integral ", unit: "g", quantity: 1.5, min_quantity: 0, kcal_per_100: 130, external_key: "arroz" });
    expect(created.ok && created.value).toMatchObject({ name: "Arroz integral", quantity_milli: 1500, min_quantity_milli: 0, kcal_per_100: 130 });
    expect(parseStockPatch({}).ok).toBe(false);
    expect(parseStockPatch({ surprise: true }).ok).toBe(false);
    expect(parseStockPatch({ min_quantity: null }).ok).toBe(true);
  });

  it("a dish needs ingredients, a meal needs a number or a dish, and the day cannot be in the future", () => {
    expect(parseDishCreate({ name: "Omelete" }).ok).toBe(false);
    const dish = parseDishCreate({ name: "Omelete", servings: 2, ingredients: [{ name: "Ovo", quantity: 2, unit: "un" }] });
    expect(dish.ok && dish.value.ingredients[0]?.quantity_milli).toBe(2000);
    expect(parseMealCreate({}, "2026-11-08").ok).toBe(false);
    expect(parseMealCreate({ title: "Pão", kcal: 150 }, "2026-11-08").ok).toBe(true);
    expect(parseMealCreate({ title: "Pão", kcal: 150, eaten_on: "2026-11-09" }, "2026-11-08").ok).toBe(false);
    const meal = parseMealCreate({ dish_id: "00000000-0000-4000-8000-000000000001", servings: 1.5 }, "2026-11-08");
    expect(meal.ok && meal.value).toMatchObject({ servings_milli: 1500, kcal: null, eaten_on: "2026-11-08" });
    expect(parseShoppingCreate({ quantity: 2 }).ok).toBe(false);
    expect(parseShoppingCreate({ name: "Leite", quantity: 1, unit: "l" }).ok).toBe(false);
    expect(parseShoppingCreate({ name: "Leite" }).ok).toBe(true);
  });

  it("builds a stable slug and a readable quantity", () => {
    expect(foodSlug("Açúcar cristal")).toBe("acucar_cristal");
    expect(nextSlug("arroz", new Set(["arroz", "arroz_2"]))).toBe("arroz_3");
    expect(formatQuantity(1_500, "un")).toBe("1,5 un");
    expect(formatQuantity(500_000, "g")).toBe("500 g");
  });
});
