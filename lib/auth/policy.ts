import type { AccountUser } from "@/lib/auth/types";

/**
 * Account rules, kept pure so they are tested without a database.
 * - Each person changes only their own password (with the current one).
 * - Only a master account (role admin) creates accounts or resets someone else's password;
 *   the reset forces that person to choose a new one at the next sign-in.
 */
export function canManageAccounts(actor: Pick<AccountUser, "role"> | null): boolean {
  return actor?.role === "admin";
}

export function canResetPassword(actor: Pick<AccountUser, "id" | "role"> | null, targetId: string): boolean {
  return Boolean(actor && actor.role === "admin" && actor.id !== targetId);
}

/** On the public deploy (Vercel) an account still on the old initial password cannot sign in. */
export function isPublicDeploy(env: Record<string, string | undefined> = process.env): boolean {
  return env.VERCEL === "1" || env.CASA_PUBLIC === "1";
}

export type FirstRunMode = "form" | "seed_only";

/**
 * With no account yet: locally the login page offers to create the first account.
 * On the public deploy anyone could claim it, so it must be seeded with npm run db:migrate
 * (CASA_FIRST_USERNAME and CASA_FIRST_PASSWORD in the shell, never in the repo).
 */
export function firstRunMode(env: Record<string, string | undefined> = process.env): FirstRunMode {
  return isPublicDeploy(env) ? "seed_only" : "form";
}
