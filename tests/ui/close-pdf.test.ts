import { describe, expect, test } from "vitest";
import type { MonthClose } from "@/lib/domain/finance/close";
import { renderClosePdf } from "@/lib/ui/close-pdf";

const close: MonthClose = {
  month: "2026-10",
  next_month: "2026-11",
  closed_on: "2026-11-07",
  income_cents: 500000,
  expense_cents: 80000,
  result_cents: 420000,
  forecast_income_cents: 500000,
  forecast_expense_cents: 70000,
  income_forecast_from: "income",
  lines: [{ slug: "mercado", name: "Mercado", spent_cents: 80000, forecast_cents: 70000, forecast_from: "budget" }],
};

describe("close pdf", () => {
  test("is a PDF that names the month and the forecast", () => {
    const text = new TextDecoder().decode(renderClosePdf(close));
    expect(text.startsWith("%PDF-1.4")).toBe(true);
    expect(text.trimEnd().endsWith("%%EOF")).toBe(true);
    expect(text).toContain("outubro de 2026");
    expect(text).toContain("novembro de 2026");
    expect(text).toContain("R$ 800,00");
    expect(text).toContain("R$ 700,00");
    // "Previsão" keeps the ã (WinAnsi 0xE3) instead of dropping it.
    expect(text).toContain("Previs\\343o");
  });
});
