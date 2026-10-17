import { describe, expect, test } from "vitest";
import { budgetLines, effectiveBudgets, type BudgetCategory } from "@/lib/domain/finance/budget";
import { accountBalance, cardCycle, netWorth } from "@/lib/domain/finance/money";
import { SECTOR_MAP_SAMPLES, sectorCategory } from "@/lib/domain/finance/sector-map";

const totals = (income: number, expense: number, tin = 0, tout = 0) => ({
  income_cents: income, expense_cents: expense, transfer_in_cents: tin, transfer_out_cents: tout,
});

describe("account balance", () => {
  test("asset: income and transfers in add", () => {
    expect(accountBalance("checking", 100_00, totals(50_00, 30_00, 10_00, 5_00))).toBe(125_00);
  });
  test("credit card holds what is owed: purchases add, payments subtract", () => {
    // 200 owed, bought 300, refund 20, paid 150 from checking.
    expect(accountBalance("credit_card", 200_00, totals(20_00, 300_00, 150_00, 0))).toBe(330_00);
  });
  test("net worth subtracts liabilities", () => {
    expect(
      netWorth([
        { kind: "checking", balance_cents: 1000 },
        { kind: "savings", balance_cents: 500 },
        { kind: "credit_card", balance_cents: 300 },
      ]),
    ).toEqual({ assets_cents: 1500, liabilities_cents: 300, net_cents: 1200 });
  });
});

describe("card statement cycle", () => {
  test("after the closing day the statement closes next month", () => {
    expect(cardCycle("2026-10-16", 5, 12)).toEqual({ from: "2026-10-06", to: "2026-11-05", due_date: "2026-11-12" });
  });
  test("before the closing day; due in the following month when due day <= close day", () => {
    expect(cardCycle("2026-10-16", 25, 5)).toEqual({ from: "2026-09-26", to: "2026-10-25", due_date: "2026-11-05" });
  });
  test("closing day 31 clamps", () => {
    expect(cardCycle("2026-02-10", 31, 10)).toEqual({ from: "2026-02-01", to: "2026-02-28", due_date: "2026-03-10" });
  });
});

describe("budgets", () => {
  const cats: BudgetCategory[] = [
    { id: "m", slug: "moradia", name: "Moradia", kind: "expense", parent_id: null, sort_order: 1 },
    { id: "e", slug: "energia", name: "Energia", kind: "expense", parent_id: "m", sort_order: 1 },
    { id: "a", slug: "agua", name: "Água", kind: "expense", parent_id: "m", sort_order: 2 },
    { id: "p", slug: "pets", name: "Pets", kind: "expense", parent_id: null, sort_order: 2 },
    { id: "s", slug: "salario", name: "Salário", kind: "income", parent_id: null, sort_order: 1 },
  ];
  test("a month's budget wins over the default", () => {
    const map = effectiveBudgets(
      [
        { category_id: "p", month: null, amount_cents: 100 },
        { category_id: "p", month: "2026-10-01", amount_cents: 200 },
        { category_id: "e", month: null, amount_cents: 50 },
      ],
      "2026-10-01",
    );
    expect(map.get("p")).toBe(200);
    expect(map.get("e")).toBe(50);
  });
  test("parent without its own budget sums its children, and spending includes children", () => {
    const lines = budgetLines(cats, new Map([["e", 300], ["a", 100]]), new Map([["e", 350], ["a", 20], ["p", 80]]));
    const moradia = lines.find((line) => line.slug === "moradia");
    expect(moradia).toMatchObject({ budget_cents: 400, total_spent_cents: 370, over: false, remaining_cents: 30 });
    expect(lines.find((line) => line.slug === "energia")).toMatchObject({ over: true, parent_slug: "moradia" });
    expect(lines.find((line) => line.slug === "pets")).toMatchObject({ budget_cents: null, spent_cents: 80, over: false });
    expect(lines.some((line) => line.slug === "salario")).toBe(false);
  });
});

describe("sector map", () => {
  test("defaults", () => {
    expect(sectorCategory("dog", "vet")).toBe("pets_saude");
    expect(sectorCategory("dog", "weight")).toBe("pets");
    expect(sectorCategory("car", "oil")).toBe("carro_manutencao");
    expect(sectorCategory("house", "repair")).toBe("casa_manutencao");
    expect(sectorCategory("family", "medicine")).toBe("saude_farmacia");
    expect(sectorCategory("finance", "bill")).toBe("outros");
    expect(SECTOR_MAP_SAMPLES.length).toBeGreaterThan(15);
  });
});
