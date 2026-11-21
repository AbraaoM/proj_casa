import { describe, expect, it } from "vitest";
import { proxyDecision } from "@/lib/auth/routes";

describe("proxy decision", () => {
  it("lets / through without a session, so the page can show the landing", () => {
    expect(proxyDecision("/", false)).toBe("pass");
    expect(proxyDecision("/login", false)).toBe("pass");
    expect(proxyDecision("/manifest.webmanifest", false)).toBe("pass");
    expect(proxyDecision("/robots.txt", false)).toBe("pass");
    expect(proxyDecision("/sitemap.xml", false)).toBe("pass");
    expect(proxyDecision("/opengraph-image", false)).toBe("pass");
    expect(proxyDecision("/sw.js", false)).toBe("pass");
    expect(proxyDecision("/offline.html", false)).toBe("pass");
  });

  it("opens the sign-up, the legal drafts and invitation links to people without an account", () => {
    for (const path of ["/cadastrar", "/privacidade", "/termos", "/convite/abc123DEF456ghi789_-"]) {
      expect(proxyDecision(path, false)).toBe("pass");
    }
    expect(proxyDecision("/convite", false)).toBe("login");
    expect(proxyDecision("/usuarios", false)).toBe("login");
  });

  it("lets the per-family Telegram webhook through for the secret header to check", () => {
    expect(proxyDecision("/api/telegram/webhook/0f5a4e2c-6d1b-4c3a-9a7e-2b8d1c4e5f60", false)).toBe("pass");
  });

  it("still sends the private pages to /login without a session", () => {
    for (const path of ["/familia", "/financas/contas", "/mais", "/agentes", "/agenda", "/hoje", "/usuarios", "/caes/x"]) {
      expect(proxyDecision(path, false)).toBe("login");
      expect(proxyDecision(path, true)).toBe("pass");
    }
    expect(proxyDecision("/api/telegram/report", false)).toBe("pass");
  });

  it("never touches the agent API, with or without a cookie", () => {
    for (const path of ["/api/agent/health", "/api/agent/items/1/doses", "/api/agent/finance/summary"]) {
      expect(proxyDecision(path, false)).toBe("pass");
      expect(proxyDecision(path, true)).toBe("pass");
    }
  });
});
