import type { TenantScope } from "@/lib/tenant/scope";

/** The family of the signed-in person (session cookie), or null. Lazy-imported by lib/db/tenant.ts to avoid a cycle. */
export async function currentTenantFromSession(): Promise<TenantScope | null> {
  const { currentUser } = await import("@/lib/auth/session");
  let user;
  try {
    user = await currentUser();
  } catch (error) {
    // Outside a request (no cookies to read) there is no signed-in person. Any other error is real.
    if (error instanceof Error && /outside a request scope|request scope/i.test(error.message)) return null;
    throw error;
  }
  return user?.family ?? null;
}
