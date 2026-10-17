import { describe, expect, it } from "vitest";
import { centsToReaisInput, reaisToCents, screenPayKey } from "@/lib/domain/finance/screen-pay";

describe("Paguei helpers", () => {
  it("reads amounts typed in reais", () => {
    expect(reaisToCents("198,73")).toBe(19873);
    expect(reaisToCents("R$ 1.198,73")).toBe(119873);
    expect(reaisToCents("198.73")).toBe(19873);
    expect(reaisToCents("1.200")).toBe(120000);
    expect(reaisToCents("198")).toBe(19800);
  });

  it("empty means the expected amount; garbage and zero are invalid", () => {
    expect(reaisToCents("")).toBeNull();
    expect(reaisToCents(null)).toBeNull();
    expect(reaisToCents("abc")).toBeUndefined();
    expect(reaisToCents("0")).toBeUndefined();
    expect(reaisToCents("1,234")).toBeUndefined();
  });

  it("formats the field and keys by bill and due date", () => {
    expect(centsToReaisInput(21000)).toBe("210,00");
    expect(screenPayKey("b1", "2026-10-20")).toBe("ui:pay:b1:2026-10-20");
  });
});
