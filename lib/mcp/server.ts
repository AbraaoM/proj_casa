/**
 * Remote MCP server over Streamable HTTP, stateless: each POST carries one JSON-RPC message
 * (or a batch) and gets a JSON answer. No session, no server-sent events, so it fits a
 * serverless function. Spec: https://modelcontextprotocol.io/specification/2025-06-18/basic/transports
 *
 * Auth: Authorization: Bearer <agent key>, the same keys as /api/agent. Every tool call runs
 * as the person the key belongs to, and writes are logged in agent_activity.
 */
import { withCaller, type AgentCaller } from "@/lib/agent/actor";
import { recordActivity } from "@/lib/agent/activity";
import { authorize, type AuthResult } from "@/lib/agent/auth";
import { errorBody } from "@/lib/agent/http";
import { AGENT_TOOLS, type AgentTool, type ToolContext } from "@/lib/agent/tools";
import { getSql } from "@/lib/db/client";
import { DatabaseUnavailableError } from "@/lib/db/client";
import { householdClock } from "@/lib/services/settings";
import { todayInTimeZone } from "@/lib/domain/dates";

export const SUPPORTED_PROTOCOL_VERSIONS = ["2025-11-25", "2025-06-18", "2025-03-26", "2024-11-05"] as const;
export const SERVER_INFO = { name: "casa", title: "Casa", version: "1.0.0" };

const INSTRUCTIONS = [
  "Casa is the household dashboard: tasks and history for dogs, house, car, family and simple finance.",
  "Dates are calendar days (YYYY-MM-DD) in the household time zone.",
  "Never create a finance entry on your own. After finishing a task that usually costs money (ask_cost: true), ask the person how much it cost and only then call registrar_custo.",
  "Use listar_cadastros to find ids. Answer the person in their language.",
].join(" ");

type JsonRpcId = string | number | null;
type JsonRpcMessage = { jsonrpc?: unknown; id?: JsonRpcId; method?: unknown; params?: unknown };

export type McpDeps = {
  authorize: (request: Request) => Promise<AuthResult>;
  context: () => Promise<ToolContext>;
  log: (caller: AgentCaller, action: string, status: number) => Promise<void>;
  tools: readonly AgentTool[];
};

const defaultDeps: McpDeps = {
  authorize: (request) => authorize(request),
  async context() {
    const sql = getSql();
    const clock = await householdClock(sql);
    return { sql, clock, today: todayInTimeZone(clock.timeZone) };
  },
  log: (caller, action, status) => recordActivity(caller, "mcp", action, status),
  tools: AGENT_TOOLS,
};

export async function handleMcpPost(request: Request, deps: McpDeps = defaultDeps): Promise<Response> {
  const auth = await deps.authorize(request);
  if (!auth.ok) return unauthorized(auth.response);

  let body: unknown;
  try {
    body = JSON.parse(await request.text());
  } catch {
    return Response.json(rpcError(null, -32700, "Parse error: body must be JSON."), { status: 400 });
  }

  const messages = Array.isArray(body) ? body : [body];
  if (messages.length === 0) return Response.json(rpcError(null, -32600, "Empty batch."), { status: 400 });

  const answers = [];
  for (const message of messages) {
    const answer = await withCaller(auth.caller, "mcp", () => handleMessage(message as JsonRpcMessage, auth.caller, deps));
    if (answer) answers.push(answer);
  }
  // Only notifications or responses: 202 Accepted with no body.
  if (answers.length === 0) return new Response(null, { status: 202 });
  return Response.json(Array.isArray(body) ? answers : answers[0], {
    headers: { "Cache-Control": "no-store" },
  });
}

async function handleMessage(message: JsonRpcMessage, caller: AgentCaller, deps: McpDeps) {
  if (!message || typeof message !== "object" || message.jsonrpc !== "2.0") {
    return rpcError(message?.id ?? null, -32600, "Invalid request: jsonrpc must be 2.0.");
  }
  const isNotification = message.id === undefined;
  if (typeof message.method !== "string") return isNotification ? null : rpcError(message.id ?? null, -32600, "Missing method.");
  if (isNotification) return null;
  const id = message.id ?? null;
  const params = (message.params && typeof message.params === "object" ? message.params : {}) as Record<string, unknown>;

  switch (message.method) {
    case "initialize": {
      const asked = typeof params.protocolVersion === "string" ? params.protocolVersion : "";
      const protocolVersion = (SUPPORTED_PROTOCOL_VERSIONS as readonly string[]).includes(asked) ? asked : SUPPORTED_PROTOCOL_VERSIONS[0];
      return rpcResult(id, {
        protocolVersion,
        capabilities: { tools: { listChanged: false } },
        serverInfo: SERVER_INFO,
        instructions: caller.agentName ? `${INSTRUCTIONS} The person calls you ${caller.agentName}.` : INSTRUCTIONS,
      });
    }
    case "ping":
      return rpcResult(id, {});
    case "tools/list":
      return rpcResult(id, {
        tools: deps.tools.map((tool) => ({
          name: tool.name,
          title: tool.title,
          description: tool.description,
          inputSchema: tool.inputSchema,
          annotations: { readOnlyHint: !tool.writes, destructiveHint: false, idempotentHint: !tool.writes, openWorldHint: false },
        })),
      });
    case "tools/call":
      return rpcResult(id, await callTool(params, caller, deps));
    case "resources/list":
      return rpcResult(id, { resources: [] });
    case "prompts/list":
      return rpcResult(id, { prompts: [] });
    default:
      return rpcError(id, -32601, `Method not found: ${message.method}.`);
  }
}

async function callTool(params: Record<string, unknown>, caller: AgentCaller, deps: McpDeps) {
  const name = typeof params.name === "string" ? params.name : "";
  const tool = deps.tools.find((candidate) => candidate.name === name);
  if (!tool) return toolError({ code: "not_found", message: `Unknown tool ${name || "(empty)"}.` });
  const args = params.arguments && typeof params.arguments === "object" && !Array.isArray(params.arguments) ? (params.arguments as Record<string, unknown>) : {};

  let status = 200;
  try {
    const data = await tool.run(args, await deps.context());
    return { content: [{ type: "text", text: JSON.stringify(data) }], structuredContent: { ok: true, data }, isError: false };
  } catch (error) {
    const body = error instanceof DatabaseUnavailableError ? { code: "database_unavailable", message: "DATABASE_URL is not set." } : errorBody(error);
    status = body.code === "validation_error" ? 400 : body.code === "not_found" ? 404 : body.code === "database_unavailable" ? 503 : 500;
    if (status === 500) console.error(error);
    return toolError(body);
  } finally {
    if (tool.writes) await deps.log(caller, `tool ${tool.name}`, status);
  }
}

function toolError(error: { code: string; message: string; details?: unknown }) {
  return { content: [{ type: "text", text: JSON.stringify({ ok: false, error }) }], structuredContent: { ok: false, error }, isError: true };
}

function rpcResult(id: JsonRpcId, result: unknown) {
  return { jsonrpc: "2.0" as const, id, result };
}

function rpcError(id: JsonRpcId, code: number, message: string) {
  return { jsonrpc: "2.0" as const, id, error: { code, message } };
}

function unauthorized(response: Response): Response {
  const headers = new Headers(response.headers);
  if (response.status === 401) headers.set("WWW-Authenticate", 'Bearer realm="casa", error="invalid_token"');
  return new Response(response.body, { status: response.status, headers });
}

/** GET would open a server-sent event stream; this stateless server does not offer one. */
export function mcpMethodNotAllowed(): Response {
  return Response.json(
    { ok: false, error: { code: "method_not_allowed", message: "Use POST with a JSON-RPC message." } },
    { status: 405, headers: { Allow: "POST" } },
  );
}
