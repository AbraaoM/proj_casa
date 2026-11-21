import { createSql, DatabaseUnavailableError, type Sql, type SystemSql } from "@/lib/db/client";
import {
  currentTenantScope,
  isWriteStatement,
  TenantScopeError,
  trialState,
  TrialExpiredError,
  type TenantScope,
} from "@/lib/tenant/scope";

/** The Postgres role every family query runs as. It is NOLOGIN and has no BYPASSRLS (migration 014). */
export const APP_ROLE = "casa_app";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Limits a connection to one family. Each query runs in its own transaction as casa_app with
 * app.family_id set, so row level security shows and accepts only that family's rows, and a
 * missing family returns nothing or fails. After the trial ends, statements that change data are refused.
 * `resolve` is asked on every query: it returns the scope or throws TenantScopeError.
 */
export function scopedSql(base: SystemSql, resolve: () => Promise<TenantScope>): Sql {
  return {
    async query<T = Record<string, unknown>>(text: string, params: unknown[] = []) {
      const scope = await resolve();
      if (!UUID.test(scope.familyId)) throw new TenantScopeError();
      if (isWriteStatement(text) && !trialState(scope).writable) throw new TrialExpiredError();
      const results = await base.batch([
        { text: `SET LOCAL ROLE ${APP_ROLE}` },
        { text: "SELECT set_config('app.family_id', $1, true)", params: [scope.familyId] },
        { text, params },
      ]);
      return (results[2] ?? []) as T[];
    },
  };
}

/** The scope of the current call: the one set by withTenant (agent, bot, jobs) or else the signed-in person's family. */
export async function resolveScope(): Promise<TenantScope> {
  const set = currentTenantScope();
  if (set) return set;
  const { currentTenantFromSession } = await import("@/lib/tenant/session");
  const fromSession = await currentTenantFromSession();
  if (fromSession) return fromSession;
  throw new TenantScopeError();
}

/** Business data access, limited to the family in scope. */
export function getSql(): Sql {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) throw new DatabaseUnavailableError();
  return scopedSql(createSql(databaseUrl), resolveScope);
}

export function tryGetSql(): Sql | null {
  if (!process.env.DATABASE_URL) return null;
  return getSql();
}
