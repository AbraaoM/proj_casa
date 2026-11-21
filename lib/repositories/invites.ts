import { createHash, randomBytes } from "node:crypto";
import type { Sql, SystemSql } from "@/lib/db/client";

export const INVITE_DAYS = 7;
const MAX_OPEN_INVITES = 20;

export type InviteStatus = "open" | "accepted" | "revoked" | "expired";

export type StoredInvite = {
  id: string;
  createdBy: string | null;
  createdAt: string;
  expiresAt: string;
  status: InviteStatus;
};

export function newInviteCode(): { code: string; hash: string } {
  const code = randomBytes(18).toString("base64url");
  return { code, hash: hashInviteCode(code) };
}

export function hashInviteCode(code: string): string {
  return createHash("sha256").update(code).digest("hex");
}

/** Tenant connection: the invite belongs to the family in scope. Returns the code once, only the hash is stored. */
export async function createInvite(sql: Sql, createdBy: string): Promise<{ id: string; code: string; expiresAt: string } | "too_many"> {
  const open = await sql.query<{ n: unknown }>(
    "SELECT count(*)::int AS n FROM family_invites WHERE accepted_at IS NULL AND revoked_at IS NULL AND expires_at > now()",
  );
  if (Number(open[0]?.n ?? 0) >= MAX_OPEN_INVITES) return "too_many";
  const { code, hash } = newInviteCode();
  const rows = await sql.query<Record<string, unknown>>(
    `INSERT INTO family_invites (family_id, code_hash, created_by, expires_at)
     VALUES (app_family_id(), $1, $2::uuid, now() + ($3 * interval '1 day'))
     RETURNING id::text AS id, expires_at`,
    [hash, createdBy, INVITE_DAYS],
  );
  const row = rows[0]!;
  return { id: String(row.id), code, expiresAt: instant(row.expires_at) };
}

export async function listInvites(sql: Sql): Promise<StoredInvite[]> {
  const rows = await sql.query<Record<string, unknown>>(
    `SELECT i.id::text AS id, u.username AS created_by, i.created_at, i.expires_at, i.accepted_at, i.revoked_at,
            (i.expires_at <= now()) AS is_expired
     FROM family_invites i
     LEFT JOIN users u ON u.id = i.created_by
     ORDER BY i.created_at DESC
     LIMIT 30`,
  );
  return rows.map((row) => ({
    id: String(row.id),
    createdBy: row.created_by == null ? null : String(row.created_by),
    createdAt: instant(row.created_at),
    expiresAt: instant(row.expires_at),
    status: row.accepted_at != null ? "accepted" : row.revoked_at != null ? "revoked" : row.is_expired === true ? "expired" : "open",
  }));
}

/** Revokes an open invite of the family in scope. */
export async function revokeInvite(sql: Sql, id: string): Promise<boolean> {
  const rows = await sql.query(
    "UPDATE family_invites SET revoked_at = now() WHERE id = $1::uuid AND accepted_at IS NULL AND revoked_at IS NULL RETURNING id",
    [id],
  );
  return rows.length > 0;
}

export type InviteLookup =
  | { found: false }
  | { found: true; id: string; familyId: string; familyName: string; status: InviteStatus };

/** Owner connection: the person opening a link has no account yet. Looks up by the hash of the code. */
export async function findInviteByCode(sql: SystemSql, code: string): Promise<InviteLookup> {
  if (!/^[A-Za-z0-9_-]{16,64}$/.test(code)) return { found: false };
  const rows = await sql.query<Record<string, unknown>>(
    `SELECT i.id::text AS id, i.family_id::text AS family_id, f.name AS family_name,
            i.accepted_at, i.revoked_at, (i.expires_at <= now()) AS is_expired
     FROM family_invites i
     JOIN families f ON f.id = i.family_id
     WHERE i.code_hash = $1`,
    [hashInviteCode(code)],
  );
  const row = rows[0];
  if (!row) return { found: false };
  return {
    found: true,
    id: String(row.id),
    familyId: String(row.family_id),
    familyName: String(row.family_name),
    status: row.accepted_at != null ? "accepted" : row.revoked_at != null ? "revoked" : row.is_expired === true ? "expired" : "open",
  };
}

function instant(value: unknown): string {
  if (value instanceof Date) return value.toISOString();
  return String(value);
}
