import { describe, expect, test } from "vitest";
import {
  agePhrase,
  categoryLabel,
  categoryUnlessTitle,
  dayAndMonth,
  daysAgoPhrase,
  formatDate,
  formatKg,
  formatKm,
  formatMoney,
} from "@/lib/ui/format";

describe("format", () => {
  test("money in reais", () => {
    expect(formatMoney(18000)).toBe("R$ 180,00");
    expect(formatMoney(123456789)).toBe("R$ 1.234.567,89");
    expect(formatMoney(5)).toBe("R$ 0,05");
  });

  test("km, kg and dates", () => {
    expect(formatKm(45200)).toBe("45.200 km");
    expect(formatKg(19.6)).toBe("19,6 kg");
    expect(formatDate("2026-10-05")).toBe("5 out 2026");
    expect(dayAndMonth("2026-03-09")).toEqual({ day: "09", month: "mar" });
  });

  test("days ago", () => {
    expect(daysAgoPhrase("2026-10-16", "2026-10-16")).toBe("hoje");
    expect(daysAgoPhrase("2026-10-15", "2026-10-16")).toBe("ontem");
    expect(daysAgoPhrase("2026-09-16", "2026-10-16")).toBe("há 30 dias");
    expect(daysAgoPhrase("2026-04-16", "2026-10-16")).toBe("há 6 meses");
    expect(daysAgoPhrase("2023-10-16", "2026-10-16")).toBe("há 3 anos");
  });

  test("age", () => {
    expect(agePhrase("2021-03-10", "2026-10-16")).toBe("5 anos");
    expect(agePhrase("2026-06-20", "2026-10-16")).toBe("3 meses");
    expect(agePhrase("2025-10-17", "2026-10-16")).toBe("11 meses");
    expect(agePhrase("2025-10-16", "2026-10-16")).toBe("1 ano");
  });

  test("category labels fall back to a readable slug", () => {
    expect(categoryLabel("deep_clean")).toBe("Limpeza pesada");
    expect(categoryLabel("troca_bateria")).toBe("Troca bateria");
    expect(categoryUnlessTitle("deworming", "Vermífugo")).toBeNull();
    expect(categoryUnlessTitle("vet", "Consulta")).toBe("Veterinário");
  });
});
