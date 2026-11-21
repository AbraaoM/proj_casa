/**
 * The sign-up, invite and trial flow through the real Server Actions against a real Postgres:
 * cookie in, scoped SQL out. Skipped unless TEST_DATABASE_URL is set (the schema is rebuilt).
 */
import { beforeAll, describe, expect, test, vi } from "vitest";

const url = process.env.TEST_DATABASE_URL;
const jar = vi.hoisted(() => ({ token: null as string | null }));

vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (name: string) => (name === "casa_session" && jar.token ? { name, value: jar.token } : undefined),
    set: (name: string, value: string) => {
      if (name === "casa_session") jar.token = value;
    },
    delete: (name: string) => {
      if (name === "casa_session") jar.token = null;
    },
  }),
  headers: async () => new Headers({ host: "app.exemplo.test", "x-forwarded-proto": "https" }),
}));
vi.mock("next/navigation", () => ({
  redirect: (to: string) => {
    throw Object.assign(new Error("NEXT_REDIRECT"), { redirectTo: to });
  },
}));
vi.mock("next/cache", () => ({ revalidatePath: () => undefined }));

function form(values: Record<string, string>) {
  const data = new FormData();
  for (const [key, value] of Object.entries(values)) data.set(key, value);
  return data;
}

async function redirected(run: () => Promise<unknown>): Promise<string | null> {
  try {
    await run();
    return null;
  } catch (error) {
    return (error as { redirectTo?: string }).redirectTo ?? null;
  }
}

describe.skipIf(!url)("sign-up, invite and trial", () => {
  let actions: typeof import("@/lib/auth/actions");
  let session: typeof import("@/lib/auth/session");
  let raw: import("@/lib/db/client").SystemSql;
  let inviteLink = "";
  const signUp = (extra: Record<string, string> = {}) => ({
    family_name: "Família Teste",
    username: "dona_teste",
    password: "senha-segura-1",
    confirm: "senha-segura-1",
    terms: "on",
    ...extra,
  });

  beforeAll(async () => {
    if (!url || !/test/.test(url)) throw new Error("TEST_DATABASE_URL must name a test database.");
    vi.stubEnv("DATABASE_DRIVER", "pg");
    vi.stubEnv("DATABASE_URL", url);
    const { createSql } = await import("@/lib/db/client");
    const { applyMigrations } = await import("@/lib/db/migrate");
    raw = createSql(url);
    await raw.query("DROP SCHEMA IF EXISTS public CASCADE");
    await raw.query("CREATE SCHEMA public");
    await applyMigrations(raw);
    actions = await import("@/lib/auth/actions");
    session = await import("@/lib/auth/session");
  });

  test("refuses a bad form without creating anything", async () => {
    const idle = { ok: false, message: "" };
    expect((await actions.signUpAction(idle, form(signUp({ terms: "" })))).ok).toBe(false);
    expect((await actions.signUpAction(idle, form(signUp({ confirm: "outra-senha-1" })))).ok).toBe(false);
    expect((await actions.signUpAction(idle, form(signUp({ family_name: "x" })))).ok).toBe(false);
    expect((await actions.signUpAction(idle, form(signUp({ website: "http://spam" })))).ok).toBe(false);
    const [count] = await raw.query<{ n: number }>("SELECT count(*)::int AS n FROM families WHERE is_original = false");
    expect(count?.n).toBe(0);
  });

  test("sign-up creates the account and its own family, signs in, and lands on /", async () => {
    const to = await redirected(() => actions.signUpAction({ ok: false, message: "" }, form(signUp())));
    expect(to).toBe("/");
    const user = await session.currentUser();
    expect(user).toMatchObject({ username: "dona_teste", role: "admin" });
    expect(user?.family).toMatchObject({ familyName: "Família Teste", role: "owner", neverExpires: false });
    expect(user?.family?.trialEndsAt).toBeTruthy();
    expect((await actions.signUpAction({ ok: false, message: "" }, form(signUp()))).message).toContain("já existe");
  });

  test("the owner makes an invite link in one tap, and only the owner", async () => {
    const created = await actions.createInviteAction();
    expect(created.ok).toBe(true);
    expect(created.link).toMatch(/^https:\/\/app\.exemplo\.test\/convite\/[A-Za-z0-9_-]{16,64}$/);
    inviteLink = created.link!;
  });

  test("the invited person joins that family as a member, once", async () => {
    jar.token = null;
    const code = inviteLink.split("/").pop()!;
    const join = (username: string) => actions.acceptInviteAction({ ok: false, message: "" }, form({ code, username, password: "senha-do-filho", confirm: "senha-do-filho", terms: "on" }));
    expect(await redirected(() => join("filho_teste"))).toBe("/");
    const user = await session.currentUser();
    expect(user?.family).toMatchObject({ familyName: "Família Teste", role: "member" });
    expect(user?.role).toBe("member");
    jar.token = null;
    expect((await join("outro_teste")).message).toContain("não vale mais");
  });

  test("a member cannot create invites", async () => {
    const { findUserByPassword, insertSession } = await import("@/lib/repositories/accounts");
    const { hashSessionToken, newSessionToken } = await import("@/lib/auth/token");
    const member = await findUserByPassword(raw, "filho_teste", "senha-do-filho");
    const token = newSessionToken();
    await insertSession(raw, member!.id, hashSessionToken(token));
    jar.token = token;
    expect((await actions.createInviteAction()).ok).toBe(false);
  });

  test("after the 14 days the family reads but cannot write", async () => {
    await raw.query("UPDATE families SET trial_ends_at = now() - interval '1 hour' WHERE name = 'Família Teste'");
    const { getSql } = await import("@/lib/db/client");
    const { TrialExpiredError } = await import("@/lib/tenant/scope");
    const sql = getSql();
    await expect(sql.query("SELECT count(*)::int AS n FROM dogs")).resolves.toBeTruthy();
    await expect(sql.query("INSERT INTO dogs (name) VALUES ('Tarde')")).rejects.toBeInstanceOf(TrialExpiredError);
    const user = await session.currentUser();
    const { trialState } = await import("@/lib/tenant/scope");
    expect(trialState(user!.family!).expired).toBe(true);
  });
});
