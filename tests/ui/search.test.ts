import { describe, expect, test } from "vitest";
import { matchesSearch, searchQuery, withQuery } from "@/lib/ui/search";

describe("list search", () => {
  test("empty query keeps every row", () => {
    expect(searchQuery("   ")).toBe("");
    expect(matchesSearch("  ", ["Vacina"])).toBe(true);
    expect(matchesSearch(undefined, [])).toBe(true);
  });

  test("ignores case and accents, and wants every word", () => {
    expect(matchesSearch("vacina", ["Vacinação antirrábica"])).toBe(true);
    expect(matchesSearch("cao", ["Cão", "Thor"])).toBe(true);
    expect(matchesSearch("oleo 5", ["Troca de óleo", "5.000 km"])).toBe(true);
    expect(matchesSearch("oleo filtro", ["Troca de óleo"])).toBe(false);
  });

  test("collapses spaces and ignores a huge paste", () => {
    expect(searchQuery("  banheiro   piso  ")).toBe("banheiro piso");
    expect(searchQuery("a".repeat(200))).toHaveLength(80);
  });

  test("keeps the other filters when building the address", () => {
    expect(withQuery("/caes/1", { categoria: "vaccine", q: "raiva" })).toBe("/caes/1?categoria=vaccine&q=raiva");
    expect(withQuery("/financas/lancamentos", { mes: "2026-10", q: "" })).toBe("/financas/lancamentos?mes=2026-10");
    expect(withQuery("/casa", {})).toBe("/casa");
  });
});
