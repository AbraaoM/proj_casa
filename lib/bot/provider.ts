import type { LanguageModel } from "ai";

/**
 * Which AI model the bot talks to. Chosen on the bot settings page (admin), stored in bot_config;
 * the key is stored encrypted. Default: Groq (free plan, does not keep data by default) with
 * openai/gpt-oss-120b, as in the approved study.
 */
export const AI_PROVIDERS = ["groq", "openai", "anthropic", "google", "openrouter", "openai-compatible"] as const;
export type AiProvider = (typeof AI_PROVIDERS)[number];

export const DEFAULT_PROVIDER: AiProvider = "groq";
export const DEFAULT_MODEL = "openai/gpt-oss-120b";
export const OPENROUTER_BASE_URL = "https://openrouter.ai/api/v1";

export const PROVIDER_LABELS: Record<AiProvider, string> = {
  groq: "Groq",
  openai: "OpenAI",
  anthropic: "Anthropic",
  google: "Google (Gemini)",
  openrouter: "OpenRouter",
  "openai-compatible": "Outro (compatível com OpenAI)",
};

/** Shown next to the choice. Free plans that train on what they receive must not get family data. */
export const PROVIDER_NOTES: Partial<Record<AiProvider, string>> = {
  groq: "Plano grátis; não treina com os dados. Ative Zero Data Retention em Settings → Data Controls.",
  google: "Não use a cota grátis do Gemini: nos termos, o Google usa o conteúdo e pessoas podem ler. Só com faturamento ativo.",
  openrouter: "Modelos :free podem treinar com os dados. Bloqueie provedores que treinam nas configurações do OpenRouter.",
  "openai-compatible": "Confira se o provedor treina com os dados antes de mandar dados da família.",
};

export type ProviderSettings = {
  provider: string;
  model: string;
  baseUrl: string | null;
  apiKey: string | null;
};

export type ResolvedProvider = { provider: AiProvider; model: string; baseUrl: string | null; apiKey: string };

export type ProviderCheck = { ok: true; value: ResolvedProvider } | { ok: false; message: string };

export function isAiProvider(value: unknown): value is AiProvider {
  return typeof value === "string" && (AI_PROVIDERS as readonly string[]).includes(value);
}

/** Validates what is saved, with a clear message for the bot settings page and the bot's error reply. */
export function checkProvider(settings: ProviderSettings): ProviderCheck {
  if (!isAiProvider(settings.provider)) return { ok: false, message: `Provedor desconhecido: ${settings.provider || "(vazio)"}.` };
  const provider = settings.provider;
  const model = settings.model.trim() || (provider === DEFAULT_PROVIDER ? DEFAULT_MODEL : "");
  if (!model) return { ok: false, message: "Informe o modelo." };
  if (!settings.apiKey) return { ok: false, message: "Falta a chave da API do provedor de IA." };
  let baseUrl: string | null = null;
  if (provider === "openai-compatible") {
    const raw = settings.baseUrl?.trim() ?? "";
    if (!raw) return { ok: false, message: "O provedor compatível com OpenAI precisa da URL base." };
    let url: URL;
    try {
      url = new URL(raw);
    } catch {
      return { ok: false, message: "A URL base não é válida." };
    }
    if (url.protocol !== "https:") return { ok: false, message: "A URL base precisa ser https." };
    baseUrl = raw.replace(/\/+$/, "");
  } else if (provider === "openrouter") {
    baseUrl = OPENROUTER_BASE_URL;
  }
  return { ok: true, value: { provider, model, baseUrl, apiKey: settings.apiKey } };
}

export type ModelFactories = Record<AiProvider, (config: ResolvedProvider) => LanguageModel | Promise<LanguageModel>>;

/** The real AI SDK providers, loaded only when used. */
export const SDK_FACTORIES: ModelFactories = {
  async groq(config) {
    const { createGroq } = await import("@ai-sdk/groq");
    return createGroq({ apiKey: config.apiKey })(config.model);
  },
  async openai(config) {
    const { createOpenAI } = await import("@ai-sdk/openai");
    return createOpenAI({ apiKey: config.apiKey })(config.model);
  },
  async anthropic(config) {
    const { createAnthropic } = await import("@ai-sdk/anthropic");
    return createAnthropic({ apiKey: config.apiKey })(config.model);
  },
  async google(config) {
    const { createGoogleGenerativeAI } = await import("@ai-sdk/google");
    return createGoogleGenerativeAI({ apiKey: config.apiKey })(config.model);
  },
  async openrouter(config) {
    const { createOpenAICompatible } = await import("@ai-sdk/openai-compatible");
    return createOpenAICompatible({ name: "openrouter", baseURL: config.baseUrl ?? OPENROUTER_BASE_URL, apiKey: config.apiKey })(config.model);
  },
  async "openai-compatible"(config) {
    const { createOpenAICompatible } = await import("@ai-sdk/openai-compatible");
    return createOpenAICompatible({ name: "custom", baseURL: config.baseUrl as string, apiKey: config.apiKey })(config.model);
  },
};

export async function createModel(config: ResolvedProvider, factories: ModelFactories = SDK_FACTORIES): Promise<LanguageModel> {
  return factories[config.provider](config);
}
