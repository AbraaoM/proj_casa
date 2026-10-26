import { describe, expect, test } from "vitest";
import { AGENT_TOOLS, likelyCostsMoney } from "@/lib/agent/tools";
import type { Sql } from "@/lib/db/client";

const CATALOG = [
  "atencao_hoje", "listar_cadastros", "listar_itens", "rotinas_casa", "historico",
  "adicionar_item", "atualizar_item", "marcar_feito", "registrar_dose", "listar_doses",
  "registrar_evento", "anular_evento", "registrar_custo",
  "cadastrar", "clima",
  "resumo_financeiro", "listar_financas", "criar_conta", "conta_a_pagar", "pagar_conta",
  "definir_orcamento", "conferir_conta", "ajustar_casa",
] as const;

/** Money fields only where the person stated the number. No free-floating transaction. */
const MONEY_TOOLS = ["registrar_custo", "conta_a_pagar", "pagar_conta", "definir_orcamento"] as const;

const context = {
  sql: { query: async () => { throw new Error("the database must not be touched"); } } as unknown as Sql,
  today: "2026-10-18",
  clock: { now: "2026-10-18T12:00:00Z", timeZone: "America/Sao_Paulo" },
};

function tool(name: string) {
  const found = AGENT_TOOLS.find((candidate) => candidate.name === name);
  if (!found) throw new Error(`missing tool ${name}`);
  return found;
}

describe("agent tool catalog", () => {
  test("names every tool the household agent needs, each with an MCP-safe name", () => {
    expect(AGENT_TOOLS.map((entry) => entry.name)).toEqual([...CATALOG]);
    for (const name of CATALOG) expect(name).toMatch(/^[a-z_]{1,64}$/);
  });

  test("every tool has an object schema that rejects unknown fields", () => {
    for (const tool of AGENT_TOOLS) {
      expect(tool.inputSchema.type).toBe("object");
      expect(tool.inputSchema.additionalProperties).toBe(false);
      expect(tool.description.length).toBeGreaterThan(20);
    }
  });

  test("only the tools the person gives a number to take amount_cents", () => {
    const withAmount = AGENT_TOOLS.filter((entry) => {
      const properties = (entry.inputSchema.properties ?? {}) as Record<string, unknown>;
      return "amount_cents" in properties;
    }).map((entry) => entry.name);
    expect(withAmount).toEqual([...MONEY_TOOLS]);
    for (const name of MONEY_TOOLS) expect(tool(name).description).toMatch(/pessoa|person/i);
  });

  test("adicionar_item accepts one schedule and, on a car, the current odometer", async () => {
    const schema = tool("adicionar_item").inputSchema.properties as Record<string, unknown>;
    expect(schema).toHaveProperty("interval_hours");
    expect(schema).toHaveProperty("ends_on");
    expect(schema).toHaveProperty("odometer_km");
    await expect(tool("adicionar_item").run(
      { domain: "house", title: "Filtro", category: "filter", interval_days: 30, interval_hours: 6 },
      context,
    )).rejects.toMatchObject({ code: "validation_error" });
    await expect(tool("adicionar_item").run(
      { domain: "house", title: "Filtro", category: "filter", odometer_km: 1000 },
      context,
    )).rejects.toMatchObject({ code: "validation_error" });
  });

  test("atualizar_item and anular_evento reject an unknown field and a non-uuid before the database", async () => {
    await expect(tool("atualizar_item").run({ item_id: "00000000-0000-4000-8000-000000000001", surprise: true }, context)).rejects.toMatchObject({ code: "validation_error" });
    await expect(tool("atualizar_item").run({ item_id: "não-é-uuid", status: "paused" }, context)).rejects.toMatchObject({ code: "not_found" });
    await expect(tool("anular_evento").run({ event_id: "00000000-0000-4000-8000-000000000001", extra: 1 }, context)).rejects.toMatchObject({ code: "validation_error" });
    await expect(tool("anular_evento").run({ event_id: "não-é-uuid" }, context)).rejects.toMatchObject({ code: "not_found" });
  });

  test("rotinas_casa rejects an unknown field or status before the database", async () => {
    await expect(tool("rotinas_casa").run({ surprise: true }, context)).rejects.toMatchObject({ code: "validation_error" });
    await expect(tool("rotinas_casa").run({ status: "late" }, context)).rejects.toMatchObject({ code: "validation_error" });
    await expect(tool("rotinas_casa").run({ limit: 0 }, context)).rejects.toMatchObject({ code: "validation_error" });
  });

  test("the frequency of a house routine is changed only by the agent, and the tools say how", () => {
    for (const name of ["rotinas_casa", "adicionar_item", "atualizar_item"]) {
      expect(tool(name).description).toMatch(/only here, when the person asks you/);
    }
    expect(tool("atualizar_item").description).toMatch(/interval_days: null/);
    const patch = tool("atualizar_item").inputSchema.properties as Record<string, { type: unknown }>;
    expect(patch.interval_days!.type).toEqual(["integer", "null"]);
    expect(patch).toHaveProperty("last_done_on");
    expect(tool("adicionar_item").inputSchema.properties).toHaveProperty("last_done_on");
  });

  test("cadastrar without a name fails before the database", async () => {
    await expect(tool("cadastrar").run({ kind: "dog" }, context)).rejects.toMatchObject({ code: "validation_error" });
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
    await expect(tool("marcar_feito").run({ item_id: "00000000-0000-4000-8000-000000000001", amount_cents: 100 }, context)).rejects.toMatchObject({
      code: "validation_error",
    });
  });
});
