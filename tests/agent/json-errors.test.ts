import { NextRequest } from "next/server";
import { describe, expect, it } from "vitest";
import { checkAgentRoute } from "@/lib/agent/route-table";
import { proxy } from "@/proxy";

function call(path: string, method = "GET") {
  return proxy(new NextRequest(`http://casa.test${path}`, { method }));
}

describe("agent API errors in JSON", () => {
  it("a missing path is a JSON 404", async () => {
    const response = call("/api/agent/nao-existe", "POST");
    expect(response.status).toBe(404);
    expect(response.headers.get("content-type")).toContain("application/json");
    expect(await response.json()).toMatchObject({ ok: false, error: { code: "not_found" } });
  });

  it("a wrong method is a JSON 405 with Allow (the old bills/bulk trap)", async () => {
    const response = call("/api/agent/finance/bills/xyz", "POST");
    expect(response.status).toBe(405);
    expect(response.headers.get("allow")).toBe("GET, PATCH");
    expect(await response.json()).toMatchObject({ ok: false, error: { code: "method_not_allowed" } });
  });

  it("real routes pass to their handlers, static segments before [id]", () => {
    expect(call("/api/agent/finance/bills/bulk", "POST").headers.get("x-middleware-next")).toBe("1");
    expect(call("/api/agent/items/abc/doses", "POST").headers.get("x-middleware-next")).toBe("1");
    expect(checkAgentRoute("/api/agent/health", "HEAD")).toEqual({ kind: "ok" });
    expect(checkAgentRoute("/api/agent/finance/bills/bulk", "GET")).toEqual({ kind: "method_not_allowed", allow: ["POST"] });
    expect(checkAgentRoute("/familia", "GET")).toEqual({ kind: "ok" });
  });

  it("pages keep the login redirect", () => {
    expect(call("/familia").status).toBe(307);
    expect(call("/").headers.get("x-middleware-next")).toBe("1");
  });
});
