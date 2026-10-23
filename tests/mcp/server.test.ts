import { describe, expect, test, vi } from "vitest";
import type { AgentCaller } from "@/lib/agent/actor";
import { currentCaller } from "@/lib/agent/actor";
import type { AgentTool } from "@/lib/agent/tools";
import { AppError } from "@/lib/errors";
import { handleMcpPost, mcpMethodNotAllowed, type McpDeps } from "@/lib/mcp/server";

const caller: AgentCaller = { userId: "u1", username: "pessoa", keyId: "k1", agentName: "Agente da casa" };

function deps(overrides: Partial<McpDeps> = {}): McpDeps & { log: ReturnType<typeof vi.fn> } {
  const seen: Array<AgentCaller | null> = [];
  const tools: AgentTool[] = [
    {
      name: "ler", title: "Ler", description: "Reads something for the test.", writes: false,
      inputSchema: { type: "object", properties: {}, additionalProperties: false },
      async run() { seen.push(currentCaller()); return { valor: 1 }; },
    },
    {
      name: "gravar", title: "Gravar", description: "Writes something for the test.", writes: true,
      inputSchema: { type: "object", properties: { x: { type: "integer" } }, additionalProperties: false },
      async run(args) {
        if (args.x === undefined) throw new AppError("validation_error", "x is required", 400);
        return { gravado: args.x };
      },
    },
  ];
  const log = vi.fn(async () => {});
  return {
    authorize: async () => ({ ok: true, caller }),
    context: async () => ({ sql: { query: async () => [] }, today: "2026-10-18", clock: { now: "2026-10-18T12:00:00Z", timeZone: "America/Sao_Paulo" } }),
    tools,
    ...overrides,
    log,
  } as McpDeps & { log: ReturnType<typeof vi.fn> };
}

function post(body: unknown): Request {
  return new Request("http://localhost/api/mcp", {
    method: "POST",
    headers: { "content-type": "application/json", accept: "application/json, text/event-stream", authorization: "Bearer casa_x" },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

describe("MCP endpoint", () => {
  test("initialize echoes a supported protocol version and names the agent", async () => {
    const response = await handleMcpPost(post({ jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "t", version: "1" } } }), deps());
    const body = await response.json();
    expect(response.status).toBe(200);
    expect(body.result.protocolVersion).toBe("2025-06-18");
    expect(body.result.capabilities.tools).toBeDefined();
    expect(body.result.instructions).toContain("Agente da casa");
    expect(body.result.instructions).toContain("registrar_custo");
    expect(body.result.instructions).toContain("interval_hours");
  });

  test("an unknown protocol version gets the newest one", async () => {
    const body = await (await handleMcpPost(post({ jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "1999-01-01" } }), deps())).json();
    expect(body.result.protocolVersion).toBe("2025-11-25");
  });

  test("a notification is accepted with 202 and no body", async () => {
    const response = await handleMcpPost(post({ jsonrpc: "2.0", method: "notifications/initialized" }), deps());
    expect(response.status).toBe(202);
    expect(await response.text()).toBe("");
  });

  test("tools/list returns schemas and read-only hints", async () => {
    const body = await (await handleMcpPost(post({ jsonrpc: "2.0", id: 2, method: "tools/list" }), deps())).json();
    expect(body.result.tools.map((tool: { name: string }) => tool.name)).toEqual(["ler", "gravar"]);
    expect(body.result.tools[0].annotations.readOnlyHint).toBe(true);
    expect(body.result.tools[1].annotations.readOnlyHint).toBe(false);
  });

  test("tools/call runs as the key's person and logs writes only", async () => {
    const d = deps();
    const read = await (await handleMcpPost(post({ jsonrpc: "2.0", id: 3, method: "tools/call", params: { name: "ler", arguments: {} } }), d)).json();
    expect(read.result.isError).toBe(false);
    expect(JSON.parse(read.result.content[0].text)).toEqual({ valor: 1 });
    expect(d.log).not.toHaveBeenCalled();

    const write = await (await handleMcpPost(post({ jsonrpc: "2.0", id: 4, method: "tools/call", params: { name: "gravar", arguments: { x: 7 } } }), d)).json();
    expect(write.result.structuredContent).toEqual({ ok: true, data: { gravado: 7 } });
    expect(d.log).toHaveBeenCalledWith(caller, "tool gravar", 200);
  });

  test("a tool error is a result with isError, not a protocol error", async () => {
    const d = deps();
    const body = await (await handleMcpPost(post({ jsonrpc: "2.0", id: 5, method: "tools/call", params: { name: "gravar", arguments: {} } }), d)).json();
    expect(body.result.isError).toBe(true);
    expect(body.result.structuredContent.error.code).toBe("validation_error");
    expect(d.log).toHaveBeenCalledWith(caller, "tool gravar", 400);
  });

  test("unknown tool and unknown method", async () => {
    const tool = await (await handleMcpPost(post({ jsonrpc: "2.0", id: 6, method: "tools/call", params: { name: "nada" } }), deps())).json();
    expect(tool.result.isError).toBe(true);
    const method = await (await handleMcpPost(post({ jsonrpc: "2.0", id: 7, method: "nada/fazer" }), deps())).json();
    expect(method.error.code).toBe(-32601);
  });

  test("bad JSON is a parse error", async () => {
    const response = await handleMcpPost(post("{"), deps());
    expect(response.status).toBe(400);
    expect((await response.json()).error.code).toBe(-32700);
  });

  test("a batch gets an array back", async () => {
    const body = await (await handleMcpPost(post([{ jsonrpc: "2.0", id: 1, method: "ping" }, { jsonrpc: "2.0", method: "notifications/initialized" }]), deps())).json();
    expect(body).toEqual([{ jsonrpc: "2.0", id: 1, result: {} }]);
  });

  test("a missing or wrong key is 401 with WWW-Authenticate", async () => {
    const response = await handleMcpPost(
      post({ jsonrpc: "2.0", id: 1, method: "ping" }),
      deps({ authorize: async () => ({ ok: false, response: Response.json({ ok: false, error: { code: "unauthorized" } }, { status: 401 }) }) }),
    );
    expect(response.status).toBe(401);
    expect(response.headers.get("www-authenticate")).toContain("Bearer");
  });

  test("GET is not offered (no event stream)", async () => {
    expect(mcpMethodNotAllowed().status).toBe(405);
  });
});
