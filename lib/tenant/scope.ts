import { AsyncLocalStorage } from "node:async_hooks";
import { AppError } from "@/lib/errors";

/** Which family a request, agent call or job works for. Everything the app reads or writes is limited to it. */
export type TenantScope = {
  familyId: string;
  familyName: string;
  /** owner: invites people and manages accounts. member: uses the house. */
  role: "owner" | "member";
  /** The original family never expires. */
  neverExpires: boolean;
  /** ISO instant, null when the family never expires. */
  trialEndsAt: string | null;
};

const storage = new AsyncLocalStorage<TenantScope>();

/** Runs fn for one family: every getSql() query inside is limited to it. */
export function withTenant<T>(scope: TenantScope, fn: () => Promise<T>): Promise<T> {
  return storage.run(scope, fn);
}

export function currentTenantScope(): TenantScope | null {
  return storage.getStore() ?? null;
}

export const TRIAL_DAYS = 14;

export type TrialState = { writable: boolean; expired: boolean; daysLeft: number | null; endsAt: string | null };

/** Pure: whether the family can still write. The original family never expires. */
export function trialState(scope: Pick<TenantScope, "neverExpires" | "trialEndsAt">, now: Date = new Date()): TrialState {
  if (scope.neverExpires || !scope.trialEndsAt) return { writable: true, expired: false, daysLeft: null, endsAt: null };
  const ends = new Date(scope.trialEndsAt).getTime();
  const remaining = ends - now.getTime();
  if (remaining <= 0) return { writable: false, expired: true, daysLeft: 0, endsAt: scope.trialEndsAt };
  return { writable: true, expired: false, daysLeft: Math.ceil(remaining / 86_400_000), endsAt: scope.trialEndsAt };
}

/** Thrown when code touches family data with no family in scope. It fails closed. */
export class TenantScopeError extends AppError {
  constructor() {
    super("no_family", "No family is in scope for this request.", 401);
    this.name = "TenantScopeError";
  }
}

/** Thrown for a write after the 14 days: reads still work. */
export class TrialExpiredError extends AppError {
  constructor() {
    super("trial_expired", "O teste grátis desta família terminou. Dá para ver tudo, mas não registrar nada novo.", 403);
    this.name = "TrialExpiredError";
  }
}

const WRITE = /\b(insert|update|delete|truncate)\b/i;

/** True when the statement can change data. Deliberately broad: a false positive only blocks an expired family. */
export function isWriteStatement(text: string): boolean {
  return WRITE.test(text);
}
