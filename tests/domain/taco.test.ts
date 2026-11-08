import { describe, expect, it } from "vitest";
import { parseDishCreate, parseStockCreate } from "@/lib/domain/food";
import { applyTacoToStock, resolveTaco, searchTaco, tacoIngredientKcal } from "@/lib/domain/food/taco";

describe("TACO calories", () => {
  it("uses the usual household food, raw in the pantry and cooked on the plate", () => {
    const riceBag = resolveTaco("arroz", "stock").choice;
    const ricePlate = resolveTaco("arroz", "dish").choice;
    expect(riceBag).toMatchObject({ name: "Arroz, tipo 1, cru", kcal_per_100: 358 });
    expect(ricePlate).toMatchObject({ name: "Arroz, tipo 1, cozido", kcal_per_100: 128 });
    expect(resolveTaco("arroz integral cozido", "stock").choice).toMatchObject({ id: 1, kcal_per_100: 124 });
    expect(resolveTaco("ovos", "dish").choice?.name).toContain("cozido");
    expect(resolveTaco("óleo", "stock").choice).toMatchObject({ name: "Óleo, de soja", kcal_per_100: 884 });
  });

  it("does not guess when several foods fit, and lists them", () => {
    const banana = resolveTaco("banana", "dish");
    expect(banana.choice).toBeNull();
    expect(banana.candidates.map((food) => food.name)).toEqual(expect.arrayContaining([expect.stringContaining("prata")]));
    expect(resolveTaco("banana prata", "dish").choice).toMatchObject({ name: "Banana, prata, crua" });
    expect(resolveTaco("pedra", "stock").candidates).toEqual([]);
  });

  it("fills stock and a plate without a typed calorie", () => {
    const parsed = parseStockCreate({ name: "Arroz", unit: "g", quantity: 1000 });
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    const stock = applyTacoToStock(parsed.value);
    expect(stock.kcal_per_100).toBe(358);
    expect(stock.taco_id).toBe(riceId());

    const eggs = parseDishCreate({ name: "Ovos", servings: 1, ingredients: [{ name: "Ovo", quantity: 2, unit: "un" }] });
    expect(eggs.ok).toBe(true);
    if (!eggs.ok) return;
    expect(tacoIngredientKcal(eggs.value.ingredients[0]!)).toMatchObject({ kcal: 131, taco_id: 488 });

    const stated = parseStockCreate({ name: "Arroz", unit: "g", quantity: 1, kcal_per_100: 100 });
    if (!stated.ok) return;
    expect(applyTacoToStock(stated.value).kcal_per_100).toBe(100);
    expect(searchTaco("feijão carioca", 3)[0]?.name).toContain("carioca");
  });
});

function riceId(): number {
  return resolveTaco("arroz", "stock").choice?.id ?? 0;
}
