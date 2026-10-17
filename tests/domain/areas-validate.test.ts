import { describe, expect, test } from "vitest";
import { parseAreaCreate, parseAreaPatch, SUGGESTED_AREAS } from "@/lib/domain/areas";

describe("areas", () => {
  test("creates with defaults", () => {
    expect(parseAreaCreate({ slug: "cozinha", name: " Cozinha " })).toEqual({
      ok: true,
      value: { slug: "cozinha", name: "Cozinha", kind: "room", sort_order: 0, notes: null },
    });
  });

  test("requires a valid slug and name", () => {
    const result = parseAreaCreate({ slug: "Cozinha", kind: "garden" });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.details.map((detail) => detail.field)).toEqual(["slug", "name", "kind"]);
    }
  });

  test("geral is reserved for the page of items without area", () => {
    expect(parseAreaCreate({ slug: "geral", name: "Geral" })).toEqual({
      ok: false,
      details: [{ field: "slug", message: '"geral" is reserved' }],
    });
  });

  test("the slug cannot change in a patch", () => {
    const result = parseAreaPatch({ slug: "sala", archived: true });
    expect(result).toEqual({
      ok: false,
      details: [{ field: "slug", message: "cannot change; create a new area and archive this one" }],
    });
    expect(parseAreaPatch({ archived: true, sort_order: 3 })).toEqual({
      ok: true,
      value: { archived: true, sort_order: 3 },
    });
  });

  test("suggested areas are valid and unique", () => {
    const slugs = new Set<string>();
    for (const area of SUGGESTED_AREAS) {
      expect(parseAreaCreate(area).ok).toBe(true);
      expect(slugs.has(area.slug)).toBe(false);
      slugs.add(area.slug);
    }
  });
});
