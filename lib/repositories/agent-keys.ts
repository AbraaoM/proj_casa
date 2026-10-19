import type { AgentCaller } from "@/lib/agent/actor";
import type { Sql } from "@/lib/db/client";

export type StoredAgentKey = {
  id: string;
  label: string;
  prefix: string;
  createdBy: string | null;
  createdById: string | null;
  createdAt: string;
  revokedAt: string | null;
};

/** Whether any key is active and, when the hash matches one, who it belongs to. */
export async function findAgentKeyCaller(
  sql: Sql,
  keyHash: string | null,
): Promise<{ hasActiveKey: boolean; hashMatches: boolean; caller: AgentCaller | null }> {
  const rows = await sql.query<Record<string, unknown>>(
    `SELECT
       (SELECT count(*)::int FROM agent_keys WHERE revoked_at IS NULL) AS active_count,
       k.id::text AS key_id, k.label, u.id::text AS user_id, u.username
     FROM (SELECT 1) AS one
     LEFT JOIN agent_keys k ON k.revoked_at IS NULL AND k.key_hash = $1
     LEFT JOIN users u ON u.id = k.created_by`,
    [keyHash ?? ""],
  );
  const row = rows[0];
  const matched = row?.key_id != null;
  return {
    hasActiveKey: Number(row?.active_count ?? 0) > 0,
    hashMatches: matched,
    caller: matched
      ? {
          keyId: String(row!.key_id),
          agentName: String(row!.label),
          userId: row!.user_id == null ? null : String(row!.user_id),
          username: row!.username == null ? null : String(row!.username),
        }
      : null,
  };
}

/** The first master account: who the AGENT_API_KEY environment secret acts as. */
export async function findOwnerCaller(sql: Sql): Promise<AgentCaller | null> {
  const rows = await sql.query<Record<string, unknown>>(
    `SELECT id::text AS id, username FROM users
     ORDER BY CASE WHEN role = 'admin' THEN 0 ELSE 1 END, created_at LIMIT 1`,
  );
  const row = rows[0];
  if (!row) return null;
  return { userId: String(row.id), username: String(row.username), keyId: null, agentName: null };
}

export async function insertAgentKey(
  sql: Sql,
  input: { label: string; prefix: string; hash: string; createdBy: string },
): Promise<void> {
  await sql.query(
    `INSERT INTO agent_keys (label, key_prefix, key_hash, created_by)
     VALUES ($1, $2, $3, $4::uuid)`,
    [input.label, input.prefix, input.hash, input.createdBy],
  );
}

export async function listAgentKeys(sql: Sql): Promise<StoredAgentKey[]> {
  const rows = await sql.query(
    `SELECT k.id::text AS id, k.label, k.key_prefix, u.username AS created_by, k.created_by::text AS created_by_id, k.created_at, k.revoked_at
     FROM agent_keys k
     LEFT JOIN users u ON u.id = k.created_by
     ORDER BY (k.revoked_at IS NULL) DESC, k.created_at DESC`,
  );
  return rows.map(mapKey);
}

/** A member revokes only their own keys; a master account revokes any. */
export async function revokeAgentKey(sql: Sql, id: string, actor: { id: string; role: string }): Promise<boolean> {
  const rows = await sql.query(
    `UPDATE agent_keys
     SET revoked_at = now()
     WHERE id = $1::uuid AND revoked_at IS NULL AND ($3 = 'admin' OR created_by = $2::uuid)
     RETURNING id`,
    [id, actor.id, actor.role],
  );
  return rows.length > 0;
}

function mapKey(row: Record<string, unknown>): StoredAgentKey {
  return {
    id: String(row.id),
    label: String(row.label),
    prefix: String(row.key_prefix),
    createdBy: row.created_by == null ? null : String(row.created_by),
    createdById: row.created_by_id == null ? null : String(row.created_by_id),
    createdAt: instant(row.created_at),
    revokedAt: row.revoked_at == null ? null : instant(row.revoked_at),
  };
}

function instant(value: unknown): string {
  if (value instanceof Date) return value.toISOString();
  return String(value);
}
