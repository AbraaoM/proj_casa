import { describe, expect, test } from "vitest";
import { parseCreateItem, parseDoneBody } from "@/lib/domain/validate";

describe("parseCreateItem", () => {
  test("accepts a dog vaccine with a subject and a yearly interval", () => {
    const result = parseCreateItem({
      domain: "dog",
      dog_id: "11111111-1111-4111-8111-111111111111",
      title: "Vacina V10",
      category: "vaccine",
      priority: "high",
      due_date: "2026-11-01",
      interval_days: 365,
      notes: "Clínica do centro",
      external_key: "luna-v10-anual",
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toMatchObject({
        domain: "dog",
        family_member_id: null,
        vehicle_id: null,
        status: "active",
        priority: "high",
        interval_days: 365,
      });
    }
  });

  test("rejects a dog item without a dog", () => {
    const result = parseCreateItem({
      domain: "dog",
      title: "Vacina V10",
      category: "vaccine",
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.details.map((detail) => detail.field)).toContain("dog_id");
    }
  });

  test("rejects a house item tied to a dog", () => {
    const result = parseCreateItem({
      domain: "house",
      dog_id: "11111111-1111-4111-8111-111111111111",
      title: "Faxina",
      category: "cleaning",
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.details.map((detail) => detail.field)).toContain("dog_id");
    }
  });

  test("rejects a bad date and a zero interval", () => {
    const result = parseCreateItem({
      domain: "finance",
      title: "Gás",
      category: "gas",
      due_date: "16/10/2026",
      interval_days: 0,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      const fields = result.details.map((detail) => detail.field);
      expect(fields).toContain("due_date");
      expect(fields).toContain("interval_days");
    }
  });

  test("rejects an unknown field so a typo is not stored quietly", () => {
    const result = parseCreateItem({
      domain: "finance",
      title: "Gás",
      category: "gas",
      dueDate: "2026-11-01",
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.details.map((detail) => detail.field)).toContain("dueDate");
    }
  });
});

describe("parseDoneBody", () => {
  test("defaults notes to null and keeps an optional measurement", () => {
    const result = parseDoneBody({
      done_on: "2026-10-16",
      weight_kg: 12.5,
      external_key: "luna-weight-2026-10-16",
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.notes).toBeNull();
      expect(result.value.weight_kg).toBe(12.5);
    }
  });
});
