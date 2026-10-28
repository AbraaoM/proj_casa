import { describe, expect, test } from "vitest";
import { exchangeAuthCode, insertGoogleEvent, listGoogleEvents, refreshAccessToken } from "@/lib/google/api";

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

describe("google calendar http", () => {
  test("trades the code with PKCE and does not invent a refresh token", async () => {
    const calls: Array<{ url: string; body: string }> = [];
    const fetchImpl = async (url: string, init?: RequestInit) => {
      calls.push({ url, body: String(init?.body ?? "") });
      return jsonResponse({ access_token: "access", refresh_token: "refresh", expires_in: 3600 });
    };
    const tokens = await exchangeAuthCode({
      code: "code",
      clientId: "client",
      clientSecret: "secret",
      redirectUri: "https://casa.example/api/google/callback",
      codeVerifier: "verifier",
    }, fetchImpl);
    expect(tokens).toEqual({ accessToken: "access", refreshToken: "refresh", expiresIn: 3600 });
    expect(calls[0]?.url).toBe("https://oauth2.googleapis.com/token");
    const body = new URLSearchParams(calls[0]?.body);
    expect(body.get("grant_type")).toBe("authorization_code");
    expect(body.get("code_verifier")).toBe("verifier");
    expect(body.get("client_secret")).toBe("secret");
  });

  test("refresh returns only the access token", async () => {
    const fetchImpl = async () => jsonResponse({ access_token: "next" });
    await expect(refreshAccessToken({ refreshToken: "refresh", clientId: "client", clientSecret: "secret" }, fetchImpl)).resolves.toBe("next");
  });

  test("lists events inside the window and posts a new one", async () => {
    const calls: string[] = [];
    const fetchImpl = async (url: string, init?: RequestInit) => {
      calls.push(`${init?.method ?? "GET"} ${url}`);
      if (init?.method === "POST") return jsonResponse({ id: "evt", summary: "Dentista", start: { date: "2026-11-02" }, end: { date: "2026-11-03" } });
      return jsonResponse({ items: [{ id: "evt", summary: "Dentista", start: { date: "2026-11-02" }, end: { date: "2026-11-03" } }] });
    };
    const items = await listGoogleEvents({
      accessToken: "access",
      calendarId: "primary",
      timeMin: "2026-11-02T00:00:00-03:00",
      timeMax: "2026-11-16T00:00:00-03:00",
    }, fetchImpl);
    expect(items).toHaveLength(1);
    expect(calls[0]).toContain("singleEvents=true");
    expect(calls[0]).toContain("/calendars/primary/events?");
    const created = await insertGoogleEvent({ accessToken: "access", calendarId: "primary", body: { summary: "Dentista" } }, fetchImpl);
    expect(created).toMatchObject({ id: "evt" });
    expect(calls[1]).toBe("POST https://www.googleapis.com/calendar/v3/calendars/primary/events");
  });

  test("a refusal does not echo the token", async () => {
    const fetchImpl = async () => jsonResponse({ error_description: "token has been expired or revoked" }, 400);
    await expect(refreshAccessToken({ refreshToken: "refresh", clientId: "c", clientSecret: "s" }, fetchImpl)).rejects.toMatchObject({
      code: "agenda_unavailable",
    });
  });
});
