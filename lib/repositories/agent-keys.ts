import type { Sql } from "@/lib/db/client";

export type StoredAgentKey = {
  id: string;
  label: string;
  prefix: string;
  createdBy: string | null;
  createdAt: string;
  revokedAt: string | null;
};

export async function findAgentKeyStatus(
  sql: Sql,
  keyHash: string | null,
): Promise<{ hasActiveKey: boolean; hashMatches: boolean }> {
  const rows = await sql.query<{ active_count: unknown; match_count: unknown }>(
    `SELECT
       (SELECT count(*)::int FROM agent_keys WHERE revoked_at IS NULL) AS active_count,
       (SELECT count(*)::int FROM agent_keys WHERE revoked_at IS NULL AND key_hash = $1) AS match_count`,
    [keyHash ?? ""],
  );
  const row = rows[0];
  return {
    hasActiveKey: Number(row?.active_count ?? 0) > 0,
    hashMatches: Number(row?.match_count ?? 0) > 0,
  };
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
    `SELECT k.id::text AS id, k.label, k.key_prefix, u.username AS created_by, k.created_at, k.revoked_at
     FROM agent_keys k
     LEFT JOIN users u ON u.id = k.created_by
     ORDER BY (k.revoked_at IS NULL) DESC, k.created_at DESC`,
  );
  return rows.map(mapKey);
}

export async function revokeAgentKey(sql: Sql, id: string): Promise<boolean> {
  const rows = await sql.query(
    `UPDATE agent_keys
     SET revoked_at = now()
     WHERE id = $1::uuid AND revoked_at IS NULL
     RETURNING id`,
    [id],
  );
  return rows.length > 0;
}

function mapKey(row: Record<string, unknown>): StoredAgentKey {
  return {
    id: String(row.id),
    label: String(row.label),
    prefix: String(row.key_prefix),
    createdBy: row.created_by == null ? null : String(row.created_by),
    createdAt: instant(row.created_at),
    revokedAt: row.revoked_at == null ? null : instant(row.revoked_at),
  };
}

function instant(value: unknown): string {
  if (value instanceof Date) return value.toISOString();
  return String(value);
}
