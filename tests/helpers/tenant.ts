import { createSql, type Sql, type SystemSql } from "@/lib/db/client";
import { scopedSql } from "@/lib/db/tenant";
import type { TenantScope } from "@/lib/tenant/scope";

/** The family that exists before sign-up (migration 014). */
export const ORIGINAL_FAMILY_ID = "0f5a4e2c-6d1b-4c3a-9a7e-2b8d1c4e5f60";

export function scopeFor(familyId: string, overrides: Partial<TenantScope> = {}): TenantScope {
  return { familyId, familyName: "Teste", role: "owner", neverExpires: true, trialEndsAt: null, ...overrides };
}

/** A connection limited to one family, the same wrapper the app uses (role casa_app + row level security). */
export function familySql(raw: SystemSql, familyId: string = ORIGINAL_FAMILY_ID, overrides: Partial<TenantScope> = {}): Sql {
  return scopedSql(raw, async () => scopeFor(familyId, overrides));
}

export function systemSql(url: string): SystemSql {
  return createSql(url);
}
