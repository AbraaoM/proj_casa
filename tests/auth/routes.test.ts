import { describe, expect, it } from "vitest";
import { proxyDecision } from "@/lib/auth/routes";

describe("proxy decision", () => {
  it("lets / through without a session, so the page can show the landing", () => {
    expect(proxyDecision("/", false)).toBe("pass");
    expect(proxyDecision("/login", false)).toBe("pass");
    expect(proxyDecision("/manifest.webmanifest", false)).toBe("pass");
  });

  it("still sends the private pages to /login without a session", () => {
    for (const path of ["/familia", "/financas/contas", "/mais", "/agentes", "/agenda", "/usuarios", "/caes/x"]) {
      expect(proxyDecision(path, false)).toBe("login");
      expect(proxyDecision(path, true)).toBe("pass");
    }
  });

  it("never touches the agent API, with or without a cookie", () => {
    for (const path of ["/api/agent/health", "/api/agent/items/1/doses", "/api/agent/finance/summary"]) {
      expect(proxyDecision(path, false)).toBe("pass");
      expect(proxyDecision(path, true)).toBe("pass");
    }
  });
});
