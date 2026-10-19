import { APICallError, generateText, jsonSchema, stepCountIs, tool, type LanguageModel, type ModelMessage, type ToolSet } from "ai";
import { withCaller, type AgentCaller } from "@/lib/agent/actor";
import { recordActivity } from "@/lib/agent/activity";
import { errorBody } from "@/lib/agent/http";
import { AGENT_TOOLS, type ToolContext } from "@/lib/agent/tools";
import { parseAgentLabel } from "@/lib/agent/keys";
import type { StoredMessage } from "@/lib/repositories/bot";

/**
 * The tools the chat bot gets: the shared catalog minus listar_itens (atencao_hoje covers it),
 * to keep each turn small for the free-plan token limits.
 */
export const BOT_TOOL_NAMES = [
  "atencao_hoje", "listar_cadastros", "historico", "adicionar_item", "marcar_feito",
  "registrar_dose", "registrar_evento", "registrar_custo", "resumo_financeiro",
] as const;

/** Messages of history sent to the model (the free plan has a per-minute token limit). */
export const HISTORY_LIMIT = 12;
export const MAX_STEPS = 5;
export const MAX_OUTPUT_TOKENS = 700;

export type AgentTurn = {
  model: LanguageModel;
  context: ToolContext;
  caller: AgentCaller;
  agentName: string;
  personName: string;
  inGroup: boolean;
  history: StoredMessage[];
  text: string;
  /** Saves a new name for this person's agent (agent_keys.label). */
  rename: (name: string) => Promise<void>;
};

export type AgentReply = { text: string; privateText: string | null; renamedTo: string | null };

export function systemPrompt(turn: Pick<AgentTurn, "agentName" | "personName" | "inGroup" | "context">): string {
  return [
    `Você é ${turn.agentName}, o agente da casa de ${turn.personName}, no Telegram. Responda em português do Brasil, curto e direto.`,
    `Hoje é ${turn.context.today} (fuso ${turn.context.clock.timeZone}). Datas em AAAA-MM-DD.`,
    "Use as ferramentas para ler e gravar na Casa: pendências, histórico de cães, carro, família, casa e finanças. Não invente dados; se não souber o id, use listar_cadastros.",
    "Finanças: nunca crie lançamento por conta própria. Quando marcar_feito ou registrar_evento responder ask_cost: true, pergunte quanto custou e só chame registrar_custo com o valor que a pessoa disser (em centavos).",
    "Antes de gravar algo ambíguo, confirme em uma frase. Depois de gravar, diga o que ficou registrado.",
    "Se a pessoa quiser dar outro nome a você, use definir_meu_nome.",
    turn.inGroup
      ? `Você está no grupo da família. Quem falou agora é ${turn.personName}; grave em nome dessa pessoa. Assunto de saúde, dinheiro ou outro assunto só dela: use responder_no_privado e diga no grupo apenas que respondeu no privado.`
      : "Esta é uma conversa privada.",
  ].join("\n");
}

export function toModelMessages(history: StoredMessage[], text: string, personName: string, inGroup: boolean): ModelMessage[] {
  const messages: ModelMessage[] = history.map((message) =>
    message.role === "assistant"
      ? { role: "assistant", content: message.content }
      : { role: "user", content: inGroup && message.author ? `${message.author}: ${message.content}` : message.content },
  );
  messages.push({ role: "user", content: inGroup ? `${personName}: ${text}` : text });
  return messages;
}

export async function runAgentTurn(turn: AgentTurn): Promise<AgentReply> {
  let privateText: string | null = null;
  let renamedTo: string | null = null;
  const tools: ToolSet = {};
  for (const name of BOT_TOOL_NAMES) {
    const shared = AGENT_TOOLS.find((candidate) => candidate.name === name);
    if (!shared) continue;
    tools[name] = tool({
      description: shared.description,
      inputSchema: jsonSchema<Record<string, unknown>>(shared.inputSchema),
      execute: async (args: Record<string, unknown>) => {
        let status = 200;
        try {
          return await withCaller(turn.caller, "telegram", () => shared.run(args ?? {}, turn.context));
        } catch (error) {
          const body = errorBody(error);
          status = body.code === "validation_error" ? 400 : body.code === "not_found" ? 404 : 500;
          if (status === 500) console.error(error);
          return { ok: false, error: body };
        } finally {
          if (shared.writes) await recordActivity(turn.caller, "telegram", `tool ${shared.name}`, status);
        }
      },
    });
  }
  tools.definir_meu_nome = tool({
    description: "Changes the name the person calls you. Only when they ask for it.",
    inputSchema: jsonSchema<{ name: string }>({ type: "object", properties: { name: { type: "string", maxLength: 64 } }, required: ["name"], additionalProperties: false }),
    execute: async ({ name }: { name: string }) => {
      const parsed = parseAgentLabel(name);
      if (!parsed.ok) return { ok: false, error: parsed.message };
      await turn.rename(parsed.value);
      renamedTo = parsed.value;
      return { ok: true, name: parsed.value };
    },
  });
  if (turn.inGroup) {
    tools.responder_no_privado = tool({
      description: "Sends this text to the person in private instead of the group. For matters that are only theirs.",
      inputSchema: jsonSchema<{ text: string }>({ type: "object", properties: { text: { type: "string", maxLength: 3500 } }, required: ["text"], additionalProperties: false }),
      execute: async ({ text }: { text: string }) => {
        privateText = text;
        return { ok: true };
      },
    });
  }

  const result = await generateText({
    model: turn.model,
    system: systemPrompt(turn),
    messages: toModelMessages(turn.history.slice(-HISTORY_LIMIT), turn.text, turn.personName, turn.inGroup),
    tools,
    stopWhen: stepCountIs(MAX_STEPS),
    maxOutputTokens: MAX_OUTPUT_TOKENS,
    maxRetries: 1,
  });
  const text = result.text.trim() || (privateText ? "Te respondi no privado." : "Feito.");
  return { text, privateText, renamedTo };
}

/** A short reply for a model failure; the free plan's rate limit gets its own. */
export function modelFailureText(error: unknown): string {
  const status = APICallError.isInstance(error) ? error.statusCode : (error as { lastError?: unknown })?.lastError && APICallError.isInstance((error as { lastError: unknown }).lastError) ? ((error as { lastError: APICallError }).lastError.statusCode) : undefined;
  if (status === 429) return "Cheguei no limite do plano de IA agora. Tente de novo em 1 minuto.";
  if (status === 401 || status === 403) return "A chave do provedor de IA foi recusada. Quem administra a Casa precisa conferir em Agentes → Bot.";
  return "Não consegui pensar numa resposta agora. Tente de novo em instantes.";
}
