/**
 * "/" against a real Postgres: the cookie goes through currentUser() and findSessionUser().
 * Skipped unless TEST_DATABASE_URL is set.
 *
 *   TEST_DATABASE_URL=postgresql://casa:casa@localhost:5432/casa_test npx vitest run tests/integration/session-home-db.test.ts
 */
import { beforeAll, describe, expect, test, vi } from "vitest";

const url = process.env.TEST_DATABASE_URL;
const jar = vi.hoisted(() => ({ token: null as string | null }));
const loadDashboard = vi.hoisted(() => vi.fn(async () => ({ status: "ready" })));

vi.mock("next/headers", () => ({
  cookies: async () => ({ get: (name: string) => (name === "casa_session" && jar.token ? { name, value: jar.token } : undefined) }),
}));
vi.mock("@/lib/services/dashboard", () => ({ loadDashboard }));

describe.skipIf(!url)("/ with a real session table", () => {
  let Landing: unknown;
  let AppShell: unknown;
  let HomePage: () => Promise<{ type: unknown }>;
  let sql: import("@/lib/db/client").Sql;
  let userId = "";

  beforeAll(async () => {
    if (!url || !/test/.test(url)) throw new Error("TEST_DATABASE_URL must name a test database.");
    process.env.DATABASE_DRIVER = "pg";
    process.env.DATABASE_URL = url;
    const { createSql } = await import("@/lib/db/client");
    const { applyMigrations } = await import("@/lib/db/migrate");
    sql = createSql(url);
    await sql.query("DROP SCHEMA IF EXISTS public CASCADE");
    await sql.query("CREATE SCHEMA public");
    await applyMigrations(sql);
    const [user] = await sql.query<{ id: string }>("SELECT id FROM users WHERE username = 'admin'");
    userId = user!.id;
    ({ default: HomePage } = (await import("@/app/page")) as unknown as { default: typeof HomePage });
    ({ Landing } = await import("@/components/landing/landing"));
    ({ AppShell } = await import("@/components/nav/app-shell"));
  });

  async function session(token: string, expiresSql: string) {
    const { hashSessionToken } = await import("@/lib/auth/token");
    await sql.query(`INSERT INTO sessions (user_id, token_hash, expires_at) VALUES ($1::uuid, $2, ${expiresSql})`, [
      userId,
      hashSessionToken(token),
    ]);
  }

  test("no cookie: landing", async () => {
    jar.token = null;
    loadDashboard.mockClear();
    expect((await HomePage()).type).toBe(Landing);
    expect(loadDashboard).not.toHaveBeenCalled();
  });

  test("unknown token: landing", async () => {
    jar.token = "token-que-nao-existe";
    loadDashboard.mockClear();
    expect((await HomePage()).type).toBe(Landing);
    expect(loadDashboard).not.toHaveBeenCalled();
  });

  test("expired session: landing, not the dashboard", async () => {
    await session("token-vencido", "now() - interval '1 minute'");
    jar.token = "token-vencido";
    loadDashboard.mockClear();
    expect((await HomePage()).type).toBe(Landing);
    expect(loadDashboard).not.toHaveBeenCalled();
  });

  test("valid session: dashboard", async () => {
    await session("token-valido", "now() + interval '1 day'");
    jar.token = "token-valido";
    loadDashboard.mockClear();
    const page = (await HomePage()) as { type: unknown; props: { children: { props: { children: { type: () => Promise<unknown> } } } } };
    expect(page.type).toBe(AppShell);
    await page.props.children.props.children.type();
    expect(loadDashboard).toHaveBeenCalledTimes(1);
  });
});
