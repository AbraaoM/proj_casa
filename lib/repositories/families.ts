import type { SystemSql } from "@/lib/db/client";
import type { TenantScope } from "@/lib/tenant/scope";

/** Family lookups for entry points that have no person yet (webhook, cron). Owner connection. */

const SCOPE_COLUMNS = "f.id::text AS family_id, f.name AS family_name, f.never_expires, f.trial_ends_at";

function toScope(row: Record<string, unknown>): TenantScope {
  return {
    familyId: String(row.family_id),
    familyName: String(row.family_name),
    role: "owner",
    neverExpires: row.never_expires === true,
    trialEndsAt: row.trial_ends_at == null ? null : row.trial_ends_at instanceof Date ? row.trial_ends_at.toISOString() : String(row.trial_ends_at),
  };
}

export async function findFamilyScope(sql: SystemSql, familyId: string): Promise<TenantScope | null> {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(familyId)) return null;
  const rows = await sql.query<Record<string, unknown>>(`SELECT ${SCOPE_COLUMNS} FROM families f WHERE f.id = $1::uuid`, [familyId]);
  return rows[0] ? toScope(rows[0]) : null;
}

/** The family that existed before sign-up. The old webhook URL and the agent environment key belong to it. */
export async function findOriginalFamilyScope(sql: SystemSql): Promise<TenantScope | null> {
  const rows = await sql.query<Record<string, unknown>>(`SELECT ${SCOPE_COLUMNS} FROM families f WHERE f.is_original`);
  return rows[0] ? toScope(rows[0]) : null;
}

/** Families whose Telegram bot is on and still has a token, for the daily jobs. Expired families are skipped (they cannot write). */
export async function listBotFamilyScopes(sql: SystemSql): Promise<TenantScope[]> {
  const rows = await sql.query<Record<string, unknown>>(
    `SELECT ${SCOPE_COLUMNS}
     FROM bot_config c
     JOIN families f ON f.id = c.family_id
     WHERE c.enabled AND c.telegram_token_enc IS NOT NULL
       AND (f.never_expires OR f.trial_ends_at IS NULL OR f.trial_ends_at > now())
     ORDER BY f.created_at`,
  );
  return rows.map(toScope);
}
