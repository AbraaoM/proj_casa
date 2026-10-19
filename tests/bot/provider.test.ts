import { MockLanguageModelV3 } from "ai/test";
import { describe, expect, test, vi } from "vitest";
import { AI_PROVIDERS, checkProvider, createModel, DEFAULT_MODEL, OPENROUTER_BASE_URL, PROVIDER_NOTES, SDK_FACTORIES, type ModelFactories } from "@/lib/bot/provider";

function fakeFactories() {
  const model = new MockLanguageModelV3();
  const calls: string[] = [];
  const factories = Object.fromEntries(
    AI_PROVIDERS.map((name) => [name, vi.fn((config) => { calls.push(`${name}:${config.model}:${config.baseUrl ?? ""}`); return model; })]),
  ) as unknown as ModelFactories;
  return { factories, calls, model };
}

describe("AI provider selection", () => {
  test("groq is the default and fills in the default model", () => {
    const check = checkProvider({ provider: "groq", model: "", baseUrl: null, apiKey: "k" });
    expect(check).toEqual({ ok: true, value: { provider: "groq", model: DEFAULT_MODEL, baseUrl: null, apiKey: "k" } });
  });

  test("clear errors for what is missing", () => {
    expect(checkProvider({ provider: "", model: "m", baseUrl: null, apiKey: "k" })).toMatchObject({ ok: false, message: expect.stringContaining("Provedor desconhecido") });
    expect(checkProvider({ provider: "openai", model: "", baseUrl: null, apiKey: "k" })).toMatchObject({ ok: false, message: "Informe o modelo." });
    expect(checkProvider({ provider: "groq", model: "m", baseUrl: null, apiKey: null })).toMatchObject({ ok: false, message: expect.stringContaining("Falta a chave") });
    expect(checkProvider({ provider: "openai-compatible", model: "m", baseUrl: "", apiKey: "k" })).toMatchObject({ ok: false, message: expect.stringContaining("URL base") });
    expect(checkProvider({ provider: "openai-compatible", model: "m", baseUrl: "http://exemplo.test/v1", apiKey: "k" })).toMatchObject({ ok: false, message: expect.stringContaining("https") });
    expect(checkProvider({ provider: "openai-compatible", model: "m", baseUrl: "não é url", apiKey: "k" })).toMatchObject({ ok: false });
  });

  test("openrouter gets its base URL; a custom base URL loses the trailing slash", () => {
    const router = checkProvider({ provider: "openrouter", model: "x/y", baseUrl: "https://ignorado.test", apiKey: "k" });
    expect(router.ok && router.value.baseUrl).toBe(OPENROUTER_BASE_URL);
    const custom = checkProvider({ provider: "openai-compatible", model: "m", baseUrl: "https://ia.exemplo.test/v1/", apiKey: "k" });
    expect(custom.ok && custom.value.baseUrl).toBe("https://ia.exemplo.test/v1");
  });

  test("each provider builds through its own factory (mocked)", async () => {
    const { factories, calls, model } = fakeFactories();
    for (const provider of AI_PROVIDERS) {
      const check = checkProvider({ provider, model: "modelo", baseUrl: "https://ia.exemplo.test/v1", apiKey: "k" });
      expect(check.ok).toBe(true);
      if (check.ok) expect(await createModel(check.value, factories)).toBe(model);
    }
    expect(calls).toEqual([
      "groq:modelo:",
      "openai:modelo:",
      "anthropic:modelo:",
      "google:modelo:",
      `openrouter:modelo:${OPENROUTER_BASE_URL}`,
      "openai-compatible:modelo:https://ia.exemplo.test/v1",
    ]);
  });

  test("the real factories exist for every provider and build without a network call", async () => {
    for (const provider of AI_PROVIDERS) {
      const model = await SDK_FACTORIES[provider]({ provider, model: "modelo", baseUrl: "https://ia.exemplo.test/v1", apiKey: "fake" });
      expect(model).toBeTruthy();
    }
  });

  test("the screen warns about free tiers that train on the data", () => {
    expect(PROVIDER_NOTES.google).toMatch(/grátis/);
    expect(PROVIDER_NOTES.openrouter).toMatch(/treinar/);
  });
});
