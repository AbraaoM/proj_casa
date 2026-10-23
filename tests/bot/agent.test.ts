import { MockLanguageModelV3 } from "ai/test";
import type { LanguageModelV3Content, LanguageModelV3GenerateResult } from "@ai-sdk/provider";
import { describe, expect, test } from "vitest";
import { AGENT_TOOLS } from "@/lib/agent/tools";
import { BOT_TOOL_NAMES, MAX_OUTPUT_TOKENS, MAX_STEPS, runAgentTurn, systemPrompt } from "@/lib/bot/agent";
import type { Sql } from "@/lib/db/client";

function usage(): LanguageModelV3GenerateResult["usage"] {
  return { inputTokens: { total: 10, noCache: 10, cacheRead: 0, cacheWrite: 0 }, outputTokens: { total: 5, text: 5, reasoning: 0 } };
}

function scripted(steps: Array<string | { tool: string; input: Record<string, unknown> }>) {
  let i = 0;
  return new MockLanguageModelV3({
    doGenerate: async () => {
      const step = steps[Math.min(i, steps.length - 1)]!;
      i += 1;
      const content: LanguageModelV3Content[] =
        typeof step === "string"
          ? [{ type: "text", text: step }]
          : [{ type: "tool-call", toolCallId: `call-${i}`, toolName: step.tool, input: JSON.stringify(step.input) }];
      return { content, finishReason: { unified: typeof step === "string" ? "stop" : "tool-calls", raw: undefined }, usage: usage(), warnings: [] };
    },
  });
}

const turn = {
  agentName: "Agente",
  personName: "Pessoa",
  inGroup: false,
  context: {
    sql: { query: async () => { throw new Error("no database"); } } as unknown as Sql,
    today: "2026-10-22",
    clock: { now: "2026-10-22T15:00:00Z", timeZone: "America/Sao_Paulo" },
  },
};

describe("telegram agent", () => {
  test("the prompt carries the household manual and the bot gets every shared tool", () => {
    const prompt = systemPrompt(turn);
    expect(prompt).toContain("Pessoa");
    expect(prompt).toContain("vaccine");
    expect(prompt).toMatch(/24/);
    expect(prompt).toContain("odometer_km");
    expect([...BOT_TOOL_NAMES]).toEqual(AGENT_TOOLS.map((entry) => entry.name));
    expect(MAX_STEPS).toBeGreaterThanOrEqual(8);
    expect(MAX_OUTPUT_TOKENS).toBeGreaterThanOrEqual(1000);
  });

  test("a failed write is not reported as saved", async () => {
    const reply = await runAgentTurn({
      ...turn,
      model: scripted([
        { tool: "adicionar_item", input: { domain: "car", title: "Troca de óleo", category: "oil", due_date: "2026-12-15" } },
        "Anotei a troca de óleo.",
      ]),
      caller: { userId: "u1", username: "pessoa", keyId: "k1", agentName: "Agente" },
      history: [],
      text: "próxima troca de óleo dia 15/12",
      rename: async () => {},
    });
    expect(reply.text.startsWith("Não consegui gravar")).toBe(true);
    expect(reply.text).not.toContain("Anotei");
  });
});
