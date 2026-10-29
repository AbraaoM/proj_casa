import { createHash } from "node:crypto";
import type { Sql } from "@/lib/db/client";

export type StoredConnection = {
  userId: string;
  username: string;
  googleEmail: string | null;
  refreshTokenEnc: string;
  calendarId: string;
};

export type ConsumedState = { userId: string; verifierEnc: string };

export function hashOAuthState(state: string): string {
  return createHash("sha256").update(state).digest("hex");
}

export async function replaceOAuthState(
  sql: Sql,
  input: { stateHash: string; userId: string; verifierEnc: string },
): Promise<void> {
  await sql.query(
    `DELETE FROM google_oauth_states WHERE user_id = $1::uuid OR expires_at < now() - interval '1 day'`,
    [input.userId],
  );
  await sql.query(
    `INSERT INTO google_oauth_states (state_hash, user_id, verifier_enc, expires_at)
     VALUES ($1, $2::uuid, $3, now() + interval '10 minutes')`,
    [input.stateHash, input.userId, input.verifierEnc],
  );
}

/** Burns the state. Null when it is unknown, expired, or already used. */
export async function consumeOAuthState(sql: Sql, stateHash: string): Promise<ConsumedState | null> {
  const rows = await sql.query<{ user_id: string; verifier_enc: string }>(
    `UPDATE google_oauth_states
     SET used_at = now()
     WHERE state_hash = $1 AND used_at IS NULL AND expires_at > now()
     RETURNING user_id::text AS user_id, verifier_enc`,
    [stateHash],
  );
  const row = rows[0];
  return row ? { userId: row.user_id, verifierEnc: row.verifier_enc } : null;
}

export async function listActiveConnections(sql: Sql): Promise<StoredConnection[]> {
  const rows = await sql.query<{
    user_id: string;
    username: string;
    google_email: string | null;
    refresh_token_enc: string;
    calendar_id: string;
  }>(
    `SELECT c.user_id::text AS user_id, u.username, c.google_email, c.refresh_token_enc, c.calendar_id
     FROM google_connections c
     JOIN users u ON u.id = c.user_id
     WHERE c.revoked_at IS NULL
     ORDER BY u.username`,
  );
  return rows.map((row) => ({
    userId: row.user_id,
    username: row.username,
    googleEmail: row.google_email,
    refreshTokenEnc: row.refresh_token_enc,
    calendarId: row.calendar_id,
  }));
}

export async function findActiveConnection(sql: Sql, userId: string): Promise<StoredConnection | null> {
  const rows = await sql.query<{
    user_id: string;
    username: string;
    google_email: string | null;
    refresh_token_enc: string;
    calendar_id: string;
  }>(
    `SELECT c.user_id::text AS user_id, u.username, c.google_email, c.refresh_token_enc, c.calendar_id
     FROM google_connections c
     JOIN users u ON u.id = c.user_id
     WHERE c.user_id = $1::uuid AND c.revoked_at IS NULL`,
    [userId],
  );
  const row = rows[0];
  return row
    ? { userId: row.user_id, username: row.username, googleEmail: row.google_email, refreshTokenEnc: row.refresh_token_enc, calendarId: row.calendar_id }
    : null;
}

export async function saveConnection(
  sql: Sql,
  input: { userId: string; googleEmail: string | null; refreshTokenEnc: string; calendarId?: string },
): Promise<void> {
  await sql.query(
    `UPDATE google_connections SET revoked_at = now() WHERE user_id = $1::uuid AND revoked_at IS NULL`,
    [input.userId],
  );
  await sql.query(
    `INSERT INTO google_connections (user_id, google_email, refresh_token_enc, calendar_id)
     VALUES ($1::uuid, $2, $3, $4)`,
    [input.userId, input.googleEmail, input.refreshTokenEnc, input.calendarId ?? "primary"],
  );
}

export async function revokeConnection(sql: Sql, userId: string): Promise<StoredConnection | null> {
  const current = await findActiveConnection(sql, userId);
  if (!current) return null;
  await sql.query(
    `UPDATE google_connections SET revoked_at = now() WHERE user_id = $1::uuid AND revoked_at IS NULL`,
    [userId],
  );
  return current;
}

export async function findEventKey(
  sql: Sql,
  userId: string,
  externalKey: string,
): Promise<{ googleEventId: string; calendarId: string } | null> {
  const rows = await sql.query<{ google_event_id: string; calendar_id: string }>(
    `SELECT google_event_id, calendar_id FROM google_event_keys WHERE user_id = $1::uuid AND external_key = $2`,
    [userId, externalKey],
  );
  const row = rows[0];
  return row ? { googleEventId: row.google_event_id, calendarId: row.calendar_id } : null;
}

export async function saveEventKey(
  sql: Sql,
  input: { userId: string; externalKey: string; googleEventId: string; calendarId: string },
): Promise<void> {
  await sql.query(
    `INSERT INTO google_event_keys (user_id, external_key, google_event_id, calendar_id)
     VALUES ($1::uuid, $2, $3, $4)
     ON CONFLICT (user_id, external_key) DO NOTHING`,
    [input.userId, input.externalKey, input.googleEventId, input.calendarId],
  );
}

export async function deleteEventKey(sql: Sql, userId: string, externalKey: string): Promise<void> {
  await sql.query(`DELETE FROM google_event_keys WHERE user_id = $1::uuid AND external_key = $2`, [userId, externalKey]);
}
