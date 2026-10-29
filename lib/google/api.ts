import { AppError } from "@/lib/errors";

export type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

export type GoogleTokens = {
  accessToken: string;
  refreshToken: string | null;
  expiresIn: number;
};

const TOKEN_URL = "https://oauth2.googleapis.com/token";
const USERINFO_URL = "https://openidconnect.googleapis.com/v1/userinfo";
const REVOKE_URL = "https://oauth2.googleapis.com/revoke";

export async function exchangeAuthCode(
  input: { code: string; clientId: string; clientSecret: string; redirectUri: string; codeVerifier: string },
  fetchImpl: FetchLike = fetch,
): Promise<GoogleTokens> {
  const body = new URLSearchParams({
    code: input.code,
    client_id: input.clientId,
    client_secret: input.clientSecret,
    redirect_uri: input.redirectUri,
    grant_type: "authorization_code",
    code_verifier: input.codeVerifier,
  });
  return readTokens(await postForm(TOKEN_URL, body, fetchImpl));
}

export async function refreshAccessToken(
  input: { refreshToken: string; clientId: string; clientSecret: string },
  fetchImpl: FetchLike = fetch,
): Promise<string> {
  const body = new URLSearchParams({
    refresh_token: input.refreshToken,
    client_id: input.clientId,
    client_secret: input.clientSecret,
    grant_type: "refresh_token",
  });
  const tokens = await readTokens(await postForm(TOKEN_URL, body, fetchImpl));
  return tokens.accessToken;
}

export async function readGoogleEmail(accessToken: string, fetchImpl: FetchLike = fetch): Promise<string | null> {
  const response = await fetchImpl(USERINFO_URL, {
    headers: { authorization: `Bearer ${accessToken}`, accept: "application/json" },
    signal: AbortSignal.timeout(8000),
  });
  if (!response.ok) return null;
  const payload = (await response.json()) as { email?: unknown };
  return typeof payload.email === "string" && payload.email.includes("@") ? payload.email.slice(0, 320) : null;
}

export async function revokeGoogleToken(token: string, fetchImpl: FetchLike = fetch): Promise<void> {
  await postForm(REVOKE_URL, new URLSearchParams({ token }), fetchImpl).catch(() => undefined);
}

export async function listGoogleEvents(
  input: { accessToken: string; calendarId: string; timeMin: string; timeMax: string },
  fetchImpl: FetchLike = fetch,
): Promise<unknown[]> {
  const params = new URLSearchParams({
    timeMin: input.timeMin,
    timeMax: input.timeMax,
    singleEvents: "true",
    orderBy: "startTime",
    maxResults: "50",
    showDeleted: "false",
  });
  const url = `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(input.calendarId)}/events?${params}`;
  const payload = await readJson(await authorized(url, input.accessToken, { method: "GET" }, fetchImpl));
  const items = payload && typeof payload === "object" && Array.isArray((payload as { items?: unknown }).items)
    ? (payload as { items: unknown[] }).items
    : [];
  return items;
}

export async function getGoogleEvent(
  input: { accessToken: string; calendarId: string; eventId: string },
  fetchImpl: FetchLike = fetch,
): Promise<unknown | null> {
  const url = `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(input.calendarId)}/events/${encodeURIComponent(input.eventId)}`;
  const response = await authorized(url, input.accessToken, { method: "GET" }, fetchImpl);
  if (response.status === 404) return null;
  return readJson(response);
}

export async function insertGoogleEvent(
  input: { accessToken: string; calendarId: string; body: Record<string, unknown> },
  fetchImpl: FetchLike = fetch,
): Promise<unknown> {
  const url = `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(input.calendarId)}/events`;
  return readJson(await authorized(url, input.accessToken, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(input.body),
  }, fetchImpl));
}

async function postForm(url: string, body: URLSearchParams, fetchImpl: FetchLike): Promise<Response> {
  return fetchImpl(url, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded", accept: "application/json" },
    body,
    signal: AbortSignal.timeout(8000),
  });
}

async function authorized(url: string, accessToken: string, init: RequestInit, fetchImpl: FetchLike): Promise<Response> {
  const headers = new Headers(init.headers);
  headers.set("authorization", `Bearer ${accessToken}`);
  headers.set("accept", "application/json");
  return fetchImpl(url, { ...init, headers, signal: AbortSignal.timeout(8000) });
}

async function readTokens(response: Response): Promise<GoogleTokens> {
  const payload = await readJson(response);
  const record = payload && typeof payload === "object" ? payload as { access_token?: unknown; refresh_token?: unknown; expires_in?: unknown } : {};
  if (typeof record.access_token !== "string" || !record.access_token) {
    throw new AppError("agenda_unavailable", "Google Agenda did not return an access token.", 503);
  }
  return {
    accessToken: record.access_token,
    refreshToken: typeof record.refresh_token === "string" ? record.refresh_token : null,
    expiresIn: typeof record.expires_in === "number" ? record.expires_in : 0,
  };
}

async function readJson(response: Response): Promise<unknown> {
  const text = await response.text();
  if (!response.ok) {
    console.error("google agenda request failed", response.status);
    throw googleFailure(response.status, text);
  }
  if (!text.trim()) return {};
  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new AppError("agenda_unavailable", "Google Agenda returned an unexpected response.", 503);
  }
}

function googleFailure(status: number, body: string): AppError {
  if (status === 401 || status === 403) {
    return new AppError("agenda_not_connected", "Google Agenda refused this connection. Connect it again.", 409);
  }
  if (status === 429) return new AppError("agenda_unavailable", "Google Agenda is rate limiting requests.", 503);
  const description = shortGoogleMessage(body);
  if (status === 400 && description) return new AppError("agenda_unavailable", description, 503);
  return new AppError("agenda_unavailable", "Google Agenda did not respond.", 503);
}

function shortGoogleMessage(body: string): string | null {
  try {
    const payload = JSON.parse(body) as { error_description?: unknown; error?: { message?: unknown } };
    const message = typeof payload.error_description === "string"
      ? payload.error_description
      : typeof payload.error?.message === "string"
        ? payload.error.message
        : "";
    const clean = message.replace(/\s+/g, " ").trim();
    if (!clean || /token|secret|bearer/i.test(clean)) return null;
    return clean.slice(0, 180);
  } catch {
    return null;
  }
}
