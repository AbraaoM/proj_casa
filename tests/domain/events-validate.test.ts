import { describe, expect, test } from "vitest";
import { parseCreateEvent, parseEventListQuery, parseEventPatch } from "@/lib/domain/events";
import { parseCreateItem, parseItemPatch } from "@/lib/domain/validate";

const DOG = "11111111-1111-4111-8111-111111111111";
const CAR = "22222222-2222-4222-8222-222222222222";
const ITEM = "33333333-3333-4333-8333-333333333333";

function fields(result: { ok: boolean; details?: Array<{ field: string }> }) {
  return result.ok ? [] : (result.details ?? []).map((detail) => detail.field);
}

describe("parseCreateEvent", () => {
  test("accepts a standalone dog event with weight and cost", () => {
    const result = parseCreateEvent({
      domain: "dog",
      dog_id: DOG,
      category: "vet",
      title: "Consulta",
      done_on: "2026-10-10",
      weight_kg: 12.4,
      amount_cents: 18000,
      provider: " Clínica ",
      external_key: "vet-1",
    });
    expect(result).toMatchObject({
      ok: true,
      value: { domain: "dog", dog_id: DOG, care_item_id: null, provider: "Clínica", weight_kg: 12.4 },
    });
  });

  test("requires domain, category and title without care_item_id", () => {
    expect(fields(parseCreateEvent({}))).toEqual(expect.arrayContaining(["domain", "category", "title"]));
  });

  test("requires the subject of the domain and rejects the others", () => {
    expect(fields(parseCreateEvent({ domain: "car", category: "oil", title: "Óleo" }))).toContain("vehicle_id");
    expect(
      fields(parseCreateEvent({ domain: "car", vehicle_id: CAR, dog_id: DOG, category: "oil", title: "Óleo" })),
    ).toContain("dog_id");
  });

  test("allows an area only on house events", () => {
    expect(parseCreateEvent({ domain: "house", area: "cozinha", category: "cleaning", title: "Limpeza" }).ok).toBe(true);
    expect(parseCreateEvent({ domain: "house", category: "repair", title: "Sem área" }).ok).toBe(true);
    expect(
      fields(parseCreateEvent({ domain: "finance", area: "cozinha", category: "bill", title: "Conta" })),
    ).toContain("area");
    expect(fields(parseCreateEvent({ domain: "house", area: "Cozinha!", category: "cleaning", title: "x" }))).toContain(
      "area",
    );
  });

  test("rejects weight outside dogs and odometer outside cars", () => {
    const result = parseCreateEvent({
      domain: "house",
      category: "repair",
      title: "Torneira",
      weight_kg: 3,
      odometer_km: 10,
    });
    expect(fields(result)).toEqual(expect.arrayContaining(["weight_kg", "odometer_km"]));
  });

  test("with care_item_id, domain is optional and category/title are inherited", () => {
    expect(parseCreateEvent({ care_item_id: ITEM, done_on: "2026-10-01" })).toMatchObject({
      ok: true,
      value: { care_item_id: ITEM, domain: null, category: null, title: null },
    });
    expect(fields(parseCreateEvent({ care_item_id: ITEM, title: "x", category: "oil" }))).toEqual(["category", "title"]);
  });

  test("rejects unknown fields and bad dates", () => {
    expect(fields(parseCreateEvent({ care_item_id: ITEM, color: "red", done_on: "2026-02-30" }))).toEqual(
      expect.arrayContaining(["color", "done_on"]),
    );
  });
});

describe("parseEventPatch", () => {
  test("accepts corrections and voiding", () => {
    expect(parseEventPatch({ voided: true, notes: null, amount_cents: 500 })).toEqual({
      ok: true,
      value: { voided: true, notes: null, amount_cents: 500 },
    });
  });

  test("does not allow moving an event to another subject", () => {
    expect(fields(parseEventPatch({ dog_id: DOG, domain: "car" }))).toEqual(["dog_id", "domain"]);
  });

  test("done_on cannot be cleared and voided must be boolean", () => {
    expect(fields(parseEventPatch({ done_on: null, voided: "yes" }))).toEqual(["done_on", "voided"]);
  });
});

describe("parseEventListQuery", () => {
  test("defaults and filters", () => {
    const result = parseEventListQuery(new URLSearchParams("area=cozinha&category=cleaning&from=2026-01-01"));
    expect(result).toMatchObject({
      ok: true,
      value: { area: "cozinha", category: "cleaning", from: "2026-01-01", limit: 50, offset: 0, include_voided: false },
    });
  });

  test("rejects an inverted range and a big limit", () => {
    expect(fields(parseEventListQuery(new URLSearchParams("from=2026-02-01&to=2026-01-01&limit=500")))).toEqual(
      expect.arrayContaining(["from", "limit"]),
    );
  });
});

describe("items with areas", () => {
  test("a house item takes an area slug", () => {
    expect(
      parseCreateItem({ domain: "house", title: "Limpar calhas", category: "outdoor", area: "telhado_calhas" }),
    ).toMatchObject({ ok: true, value: { area_slug: "telhado_calhas", area_id: null } });
  });

  test("other domains reject an area", () => {
    expect(fields(parseCreateItem({ domain: "dog", dog_id: DOG, title: "V10", category: "vaccine", area: "sala" }))).toContain(
      "area",
    );
  });

  test("patch rejects area and area_id together", () => {
    expect(fields(parseItemPatch({ area: "sala", area_id: ITEM }))).toContain("area");
  });
});
