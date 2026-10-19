import { describe, expect, test } from "vitest";
import { AGENT_TOOLS, likelyCostsMoney } from "@/lib/agent/tools";

describe("agent tool catalog", () => {
  test("has 8 to 10 tools with MCP-safe unique names", () => {
    expect(AGENT_TOOLS.length).toBeGreaterThanOrEqual(8);
    expect(AGENT_TOOLS.length).toBeLessThanOrEqual(10);
    const names = AGENT_TOOLS.map((tool) => tool.name);
    expect(new Set(names).size).toBe(names.length);
    for (const name of names) expect(name).toMatch(/^[a-z_]{1,64}$/);
  });

  test("every tool has an object schema that rejects unknown fields", () => {
    for (const tool of AGENT_TOOLS) {
      expect(tool.inputSchema.type).toBe("object");
      expect(tool.inputSchema.additionalProperties).toBe(false);
      expect(tool.description.length).toBeGreaterThan(20);
    }
  });

  test("only registrar_custo takes an amount: no finance entry on the agent's own initiative", () => {
    const withAmount = AGENT_TOOLS.filter((tool) => {
      const properties = (tool.inputSchema.properties ?? {}) as Record<string, unknown>;
      return "amount_cents" in properties;
    }).map((tool) => tool.name);
    expect(withAmount).toEqual(["registrar_custo"]);
  });

  test("tasks that usually cost money ask for the cost; others do not", () => {
    expect(likelyCostsMoney("dog", "vet")).toBe(true);
    expect(likelyCostsMoney("car", "oil")).toBe(true);
    expect(likelyCostsMoney("family", "dentist")).toBe(true);
    expect(likelyCostsMoney("house", "cleaning")).toBe(false);
    expect(likelyCostsMoney("dog", "weight")).toBe(false);
    expect(likelyCostsMoney("house", "outdoor")).toBe(false);
  });

  test("marcar_feito rejects an amount even if the model sends one", async () => {
    const tool = AGENT_TOOLS.find((candidate) => candidate.name === "marcar_feito")!;
    const context = { sql: { query: async () => [] }, today: "2026-10-18", clock: { now: "2026-10-18T12:00:00Z", timeZone: "America/Sao_Paulo" } };
    await expect(tool.run({ item_id: "00000000-0000-4000-8000-000000000001", amount_cents: 100 }, context)).rejects.toMatchObject({
      code: "validation_error",
    });
  });
});
