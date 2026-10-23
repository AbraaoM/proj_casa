import { APICallError, generateText, jsonSchema, stepCountIs, tool, type LanguageModel, type ModelMessage, type ToolSet } from "ai";
import { withCaller, type AgentCaller } from "@/lib/agent/actor";
import { recordActivity } from "@/lib/agent/activity";
import { errorBody } from "@/lib/agent/http";
import { PLAYBOOK } from "@/lib/agent/playbook";
import { AGENT_TOOLS, type ToolContext } from "@/lib/agent/tools";
import { parseAgentLabel } from "@/lib/agent/keys";
import type { StoredMessage } from "@/lib/repositories/bot";

/** The bot gets the whole shared catalog, plus its own chat tools. */
export const BOT_TOOL_NAMES = AGENT_TOOLS.map((entry) => entry.name);

/** Messages of history sent to the model (the free plan has a per-minute token limit). */
export const HISTORY_LIMIT = 12;
export const MAX_STEPS = 8;
export const MAX_OUTPUT_TOKENS = 1000;

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
    `Hoje é ${turn.context.today} (fuso ${turn.context.clock.timeZone}).`,
    PLAYBOOK,
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

function failedWrite(body: { message: string; details?: Array<{ field: string; message: string }> }): string {
  const detail = body.details?.[0];
  const why = detail ? `${detail.field}: ${detail.message}` : body.message;
  return `Não consegui gravar. ${why}`;
}

/** ajustar_casa with no fields only reads the city, so it must not count as a saved write. */
function savedSomething(name: string, args: Record<string, unknown>): boolean {
  if (name === "ajustar_casa") return Object.keys(args).length > 0;
  return true;
}

export async function runAgentTurn(turn: AgentTurn): Promise<AgentReply> {
  let privateText: string | null = null;
  let renamedTo: string | null = null;
  let writeError: string | null = null;
  let writeOk = false;
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
          const data = await withCaller(turn.caller, "telegram", () => shared.run(args ?? {}, turn.context));
          if (shared.writes && savedSomething(shared.name, args ?? {})) writeOk = true;
          return data;
        } catch (error) {
          const body = errorBody(error);
          status = body.code === "validation_error" ? 400 : body.code === "not_found" ? 404 : 500;
          if (status === 500) console.error(error);
          if (shared.writes) writeError = failedWrite(body);
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
  const text = writeError && !writeOk
    ? writeError
    : result.text.trim() || (privateText ? "Te respondi no privado." : "Feito.");
  return { text, privateText, renamedTo };
}

/** A short reply for a model failure; the free plan's rate limit gets its own. */
export function modelFailureText(error: unknown): string {
  const status = APICallError.isInstance(error) ? error.statusCode : (error as { lastError?: unknown })?.lastError && APICallError.isInstance((error as { lastError: unknown }).lastError) ? ((error as { lastError: APICallError }).lastError.statusCode) : undefined;
  if (status === 429) return "Cheguei no limite do plano de IA agora. Tente de novo em 1 minuto.";
  if (status === 401 || status === 403) return "A chave do provedor de IA foi recusada. Quem administra a Casa precisa conferir em Agentes → Bot.";
  return "Não consegui pensar numa resposta agora. Tente de novo em instantes.";
}
