import { createHash, randomBytes } from "node:crypto";
import { currentCaller } from "@/lib/agent/actor";
import type { Sql } from "@/lib/db/client";
import {
  agendaWindow,
  buildAuthUrl,
  googleRedirectUri,
  mapGoogleEvent,
  readGoogleConfig,
  sortAgenda,
  toGoogleEventBody,
  type AgendaDraft,
  type AgendaEvent,
  type GoogleConfig,
} from "@/lib/domain/calendar";
import {
  exchangeAuthCode,
  getGoogleEvent,
  insertGoogleEvent,
  listGoogleEvents,
  readGoogleEmail,
  refreshAccessToken,
  revokeGoogleToken,
  type FetchLike,
} from "@/lib/google/api";
import {
  consumeOAuthState,
  deleteEventKey,
  findActiveConnection,
  findEventKey,
  hashOAuthState,
  listActiveConnections,
  replaceOAuthState,
  revokeConnection,
  saveConnection,
  saveEventKey,
  type StoredConnection,
} from "@/lib/repositories/google-calendar";
import { AppError } from "@/lib/errors";
import { isMissingSchema } from "@/lib/db/errors";
import { readMasterKey, decryptSecret, encryptSecret } from "@/lib/secrets/crypto";

export type AgendaNotice = "unconfigured" | "secret" | "denied" | "expired" | "failed" | "connected";

export type AgendaSnapshot = {
  events: AgendaEvent[];
  connections: number;
  warnings: string[];
};

export type ConnectStart = { ok: true; url: string } | { ok: false; notice: AgendaNotice };

const NOT_CONNECTED = "Google Agenda is not connected for this person. Ask them to tap Conectar Google Agenda.";

export function agendaConfigured(env: Record<string, string | undefined> = process.env): boolean {
  return readGoogleConfig(env) !== null && readMasterKey(env).ok;
}

export async function beginGoogleConnect(sql: Sql, userId: string, origin: string, env: Record<string, string | undefined> = process.env): Promise<ConnectStart> {
  const config = readGoogleConfig(env);
  if (!config) return { ok: false, notice: "unconfigured" };
  const master = readMasterKey(env);
  if (!master.ok) return { ok: false, notice: "secret" };
  const state = randomBytes(32).toString("base64url");
  const verifier = randomBytes(32).toString("base64url");
  const challenge = createHash("sha256").update(verifier).digest("base64url");
  await replaceOAuthState(sql, { stateHash: hashOAuthState(state), userId, verifierEnc: encryptSecret(verifier, master.key) });
  const url = buildAuthUrl({
    clientId: config.clientId,
    redirectUri: googleRedirectUri(origin),
    state,
    codeChallenge: challenge,
  });
  return { ok: true, url };
}

export async function finishGoogleConnect(
  sql: Sql,
  input: { userId: string; code: string | null; state: string | null; origin: string; denied: boolean },
  env: Record<string, string | undefined> = process.env,
  fetchImpl: FetchLike = fetch,
): Promise<{ ok: true } | { ok: false; notice: AgendaNotice }> {
  if (input.denied) return { ok: false, notice: "denied" };
  const config = readGoogleConfig(env);
  if (!config) return { ok: false, notice: "unconfigured" };
  const master = readMasterKey(env);
  if (!master.ok) return { ok: false, notice: "secret" };
  if (!input.code || !input.state) return { ok: false, notice: "failed" };
  const consumed = await consumeOAuthState(sql, hashOAuthState(input.state));
  if (!consumed || consumed.userId !== input.userId) return { ok: false, notice: "expired" };
  let verifier = "";
  try {
    verifier = decryptSecret(consumed.verifierEnc, master.key);
  } catch {
    return { ok: false, notice: "secret" };
  }
  try {
    const tokens = await exchangeAuthCode({
      code: input.code,
      clientId: config.clientId,
      clientSecret: config.clientSecret,
      redirectUri: googleRedirectUri(input.origin),
      codeVerifier: verifier,
    }, fetchImpl);
    if (!tokens.refreshToken) return { ok: false, notice: "failed" };
    const email = await readGoogleEmail(tokens.accessToken, fetchImpl);
    await saveConnection(sql, {
      userId: input.userId,
      googleEmail: email,
      refreshTokenEnc: encryptSecret(tokens.refreshToken, master.key),
    });
    return { ok: true };
  } catch (error) {
    console.error("google agenda connect failed", error instanceof AppError ? error.code : "error");
    return { ok: false, notice: "failed" };
  }
}

export async function disconnectGoogleAgenda(
  sql: Sql,
  userId: string,
  env: Record<string, string | undefined> = process.env,
  fetchImpl: FetchLike = fetch,
): Promise<boolean> {
  const current = await revokeConnection(sql, userId);
  if (!current) return false;
  const master = readMasterKey(env);
  const config = readGoogleConfig(env);
  if (master.ok && config) {
    try {
      const refreshToken = decryptSecret(current.refreshTokenEnc, master.key);
      await revokeGoogleToken(refreshToken, fetchImpl);
    } catch {
      // The row is already revoked. A leftover grant can be removed in the Google account.
    }
  }
  return true;
}

export async function listHouseholdAgenda(
  sql: Sql,
  input: { today: string; timeZone: string; withinDays: number },
  env: Record<string, string | undefined> = process.env,
  fetchImpl: FetchLike = fetch,
): Promise<AgendaSnapshot> {
  const connections = await listActiveConnections(sql);
  if (connections.length === 0) return { events: [], connections: 0, warnings: [] };
  const config = readGoogleConfig(env);
  const master = readMasterKey(env);
  if (!config || !master.ok) {
    return { events: [], connections: connections.length, warnings: ["A agenda está conectada, mas o servidor não tem a configuração para lê-la."] };
  }
  const window = agendaWindow(input.today, input.withinDays, input.timeZone);
  const batches = await Promise.all(connections.map(async (connection) => readOne(connection, config, master.key, window, fetchImpl)));
  const events = sortAgenda(batches.flatMap((batch) => batch.events));
  const warnings = batches.flatMap((batch) => batch.warning ? [batch.warning] : []);
  return { events, connections: connections.length, warnings };
}

export async function createAgendaEvent(
  sql: Sql,
  draft: AgendaDraft,
  timeZone: string,
  env: Record<string, string | undefined> = process.env,
  fetchImpl: FetchLike = fetch,
): Promise<{ event: AgendaEvent; idempotentReplay: boolean }> {
  const userId = currentCaller()?.userId ?? null;
  const username = currentCaller()?.username ?? "casa";
  if (!userId) throw new AppError("agenda_not_connected", NOT_CONNECTED, 409);
  const connection = await findActiveConnection(sql, userId);
  if (!connection) throw new AppError("agenda_not_connected", NOT_CONNECTED, 409);
  const config = readGoogleConfig(env);
  const master = readMasterKey(env);
  if (!config || !master.ok) {
    throw new AppError("agenda_unavailable", "Google Agenda is not configured on the server.", 503);
  }
  const accessToken = await accessFor(connection, config, master.key, fetchImpl);
  if (draft.external_key) {
    const existing = await findEventKey(sql, userId, draft.external_key);
    if (existing) {
      const raw = await getGoogleEvent({ accessToken, calendarId: existing.calendarId, eventId: existing.googleEventId }, fetchImpl);
      const mapped = raw ? mapGoogleEvent(raw, username) : null;
      if (mapped) return { event: mapped, idempotentReplay: true };
      await deleteEventKey(sql, userId, draft.external_key);
    }
  }
  const created = mapGoogleEvent(
    await insertGoogleEvent({
      accessToken,
      calendarId: connection.calendarId,
      body: toGoogleEventBody(draft, timeZone),
    }, fetchImpl),
    username,
  );
  if (!created) throw new AppError("agenda_unavailable", "Google Agenda did not return the new event.", 503);
  if (draft.external_key) {
    await saveEventKey(sql, {
      userId,
      externalKey: draft.external_key,
      googleEventId: created.id,
      calendarId: connection.calendarId,
    });
  }
  return { event: created, idempotentReplay: false };
}

async function accessFor(
  connection: StoredConnection,
  config: GoogleConfig,
  key: Buffer,
  fetchImpl: FetchLike,
): Promise<string> {
  let refreshToken = "";
  try {
    refreshToken = decryptSecret(connection.refreshTokenEnc, key);
  } catch {
    throw new AppError("agenda_unavailable", "Could not open the saved Google Agenda connection.", 503);
  }
  return refreshAccessToken({ refreshToken, clientId: config.clientId, clientSecret: config.clientSecret }, fetchImpl);
}

async function readOne(
  connection: StoredConnection,
  config: GoogleConfig,
  key: Buffer,
  window: { timeMin: string; timeMax: string },
  fetchImpl: FetchLike,
): Promise<{ events: AgendaEvent[]; warning: string | null }> {
  try {
    const accessToken = await accessFor(connection, config, key, fetchImpl);
    const items = await listGoogleEvents({
      accessToken,
      calendarId: connection.calendarId,
      timeMin: window.timeMin,
      timeMax: window.timeMax,
    }, fetchImpl);
    return { events: items.flatMap((item) => { const mapped = mapGoogleEvent(item, connection.username); return mapped ? [mapped] : []; }), warning: null };
  } catch (error) {
    console.error("google agenda read failed", error instanceof AppError ? error.code : "error");
    return { events: [], warning: `Não li a agenda de ${connection.username}.` };
  }
}

export type AgendaLink = {
  schema: "ok" | "missing";
  configured: boolean;
  connected: boolean;
  email: string | null;
};

/** What Agentes and /agenda need to show the connect button, without calling Google. */
export async function loadAgendaLink(sql: Sql, userId: string): Promise<AgendaLink> {
  try {
    const mine = await findActiveConnection(sql, userId);
    return { schema: "ok", configured: agendaConfigured(), connected: mine !== null, email: mine?.googleEmail ?? null };
  } catch (error) {
    if (isMissingSchema(error)) return { schema: "missing", configured: false, connected: false, email: null };
    throw error;
  }
}
