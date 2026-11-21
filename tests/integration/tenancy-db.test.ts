/**
 * Families against a real Postgres: two families share one database and never see each other.
 * Skipped unless TEST_DATABASE_URL is set (the test database is dropped and rebuilt).
 */
import { afterAll, beforeAll, describe, expect, test, vi } from "vitest";
import { createSql, type Sql, type SystemSql } from "@/lib/db/client";
import { applyMigrations } from "@/lib/db/migrate";
import { familySql, ORIGINAL_FAMILY_ID, scopeFor } from "../helpers/tenant";
import { createFamilyWithOwner, acceptInvite, insertFamilyUser } from "@/lib/repositories/accounts";
import { createInvite, findInviteByCode, listInvites, revokeInvite } from "@/lib/repositories/invites";
import { createDog, listDogs } from "@/lib/services/subjects";
import { createArea, listAreas } from "@/lib/services/areas";
import { DEFAULT_CATEGORIES, DEFAULT_SUBCATEGORIES } from "@/lib/repositories/family-seed";
import { TenantScopeError, TrialExpiredError } from "@/lib/tenant/scope";
import { scopedSql } from "@/lib/db/tenant";

const url = process.env.TEST_DATABASE_URL;

// Tables that are not business data of one family, with the reason each is outside the pattern.
const NOT_BUSINESS_TABLES: Record<string, string> = {
  schema_migrations: "migration bookkeeping",
  families: "the tenants themselves (policy by id)",
  family_accounts: "membership (policy by family_id, read by the identity code)",
  family_invites: "invites (policy by family_id)",
  users: "accounts (policy through family_accounts)",
  sessions: "sessions (policy through the account)",
};

describe.skipIf(!url)("two families in one database", () => {
  let raw: SystemSql;
  let a: Sql;
  let b: Sql;
  let familyB = "";
  let userB = "";

  beforeAll(async () => {
    if (!url || !/test/.test(url)) throw new Error("TEST_DATABASE_URL must name a test database.");
    vi.stubEnv("DATABASE_DRIVER", "pg");
    raw = createSql(url);
    await raw.query("DROP SCHEMA IF EXISTS public CASCADE");
    await raw.query("CREATE SCHEMA public");
    await applyMigrations(raw);
    const user = await createFamilyWithOwner(raw, { familyName: "Família B", username: "dona_b", password: "senha-segura-b" });
    userB = user.id;
    familyB = user.family!.familyId;
    a = familySql(raw, ORIGINAL_FAMILY_ID);
    b = familySql(raw, familyB, { neverExpires: false });
  });

  afterAll(() => vi.unstubAllEnvs());

  test("sign-up creates a family on a 14-day trial with the owner and the starting data", async () => {
    const [family] = await raw.query<{ never_expires: boolean; days: number }>(
      "SELECT never_expires, round(extract(epoch FROM (trial_ends_at - created_at)) / 86400)::int AS days FROM families WHERE id = $1::uuid",
      [familyB],
    );
    expect(family).toEqual({ never_expires: false, days: 14 });
    const [member] = await raw.query<{ role: string }>("SELECT role FROM family_accounts WHERE user_id = $1::uuid", [userB]);
    expect(member).toEqual({ role: "owner" });
    const [original] = await raw.query<{ never_expires: boolean; trial_ends_at: unknown }>("SELECT never_expires, trial_ends_at FROM families WHERE id = $1::uuid", [ORIGINAL_FAMILY_ID]);
    expect(original).toEqual({ never_expires: true, trial_ends_at: null });
  });

  test("a new family gets the same starting categories as the original family (seed parity)", async () => {
    const q = "SELECT slug, kind, sort_order FROM fin_categories ORDER BY slug";
    const original = await a.query(q);
    const fresh = await b.query(q);
    expect(fresh).toEqual(original);
    expect(fresh.length).toBe(DEFAULT_CATEGORIES.length + DEFAULT_SUBCATEGORIES.length);
    const [settingsA] = await a.query<{ n: number }>("SELECT count(*)::int AS n FROM household_settings");
    const [settingsB] = await b.query<{ n: number }>("SELECT count(*)::int AS n FROM household_settings");
    expect([settingsA?.n, settingsB?.n]).toEqual([1, 1]);
  });

  test("rows written by one family are invisible to the other, through services and raw SQL", async () => {
    const dog = await createDog(a, { name: "Thor", breed: null, sex: "unknown", birth_date: null, weight_kg: null, notes: null });
    await createArea(a, { slug: "sala_a", name: "Sala A", kind: "room", sort_order: 0, notes: null });
    expect((await listDogs(b, true)).map((d) => d.name)).toEqual([]);
    expect((await listAreas(b, true)).some((x) => x.slug === "sala_a")).toBe(false);
    expect(await b.query("SELECT id FROM dogs WHERE id = $1::uuid", [dog.id])).toEqual([]);
    expect((await listDogs(a, true)).map((d) => d.name)).toEqual(["Thor"]);
    // Changing or deleting by a known id does nothing across families.
    expect(await b.query("UPDATE dogs SET name = 'Hackeado' WHERE id = $1::uuid RETURNING id", [dog.id])).toEqual([]);
    expect(await b.query("DELETE FROM dogs WHERE id = $1::uuid RETURNING id", [dog.id])).toEqual([]);
    expect((await listDogs(a, true))[0]?.name).toBe("Thor");
  });

  test("the same slug can exist in two families", async () => {
    await createArea(b, { slug: "sala_a", name: "Sala da B", kind: "room", sort_order: 0, notes: null });
    expect((await listAreas(a, true)).filter((x) => x.slug === "sala_a").map((x) => x.name)).toEqual(["Sala A"]);
    expect((await listAreas(b, true)).filter((x) => x.slug === "sala_a").map((x) => x.name)).toEqual(["Sala da B"]);
  });

  test("a row cannot be written into another family or point at another family's row", async () => {
    await expect(b.query("INSERT INTO dogs (family_id, name) VALUES ($1::uuid, 'Intruso')", [ORIGINAL_FAMILY_ID])).rejects.toThrow();
    const [dogA] = await a.query<{ id: string }>("SELECT id::text AS id FROM dogs LIMIT 1");
    await expect(
      b.query("INSERT INTO care_items (domain, dog_id, title, category) VALUES ('dog', $1::uuid, 'Consulta', 'vet')", [dogA!.id]),
    ).rejects.toThrow();
    // Even the owner connection cannot cross families: the composite foreign key refuses.
    await expect(
      raw.query("INSERT INTO care_items (family_id, domain, dog_id, title, category) VALUES ($1::uuid, 'dog', $2::uuid, 'Consulta', 'vet')", [familyB, dogA!.id]),
    ).rejects.toThrow();
  });

  test("a connection with no family in scope sees nothing and writes nothing (fails closed)", async () => {
    const orphan = scopedSql(raw, async () => {
      throw new TenantScopeError();
    });
    await expect(orphan.query("SELECT 1")).rejects.toBeInstanceOf(TenantScopeError);
    // casa_app with no app.family_id set: RLS returns no rows.
    const results = await raw.batch([
      { text: "SET LOCAL ROLE casa_app" },
      { text: "SELECT count(*)::int AS n FROM dogs" },
      { text: "SELECT count(*)::int AS n FROM fin_categories" },
      { text: "SELECT count(*)::int AS n FROM users" },
      { text: "SELECT count(*)::int AS n FROM families" },
    ]);
    expect([results[1]![0], results[2]![0], results[3]![0], results[4]![0]]).toEqual([{ n: 0 }, { n: 0 }, { n: 0 }, { n: 0 }]);
    await expect(raw.batch([{ text: "SET LOCAL ROLE casa_app" }, { text: "INSERT INTO dogs (name) VALUES ('x')" }])).rejects.toThrow();
  });

  test("a family sees only its own people", async () => {
    const people = await b.query<{ username: string }>("SELECT username FROM users ORDER BY username");
    expect(people).toEqual([{ username: "dona_b" }]);
    expect((await a.query<{ username: string }>("SELECT username FROM users")).some((u) => u.username === "dona_b")).toBe(false);
  });

  test("invites: single use, revocable, expiring, and scoped to the family that made them", async () => {
    const made = await createInvite(b, userB);
    if (made === "too_many") throw new Error("unexpected");
    expect((await listInvites(a)).length).toBe(0);
    expect((await listInvites(b)).length).toBe(1);
    const found = await findInviteByCode(raw, made.code);
    expect(found).toMatchObject({ status: "open", familyId: familyB });
    const joined = await acceptInvite(raw, { inviteId: (found as { id: string }).id, familyId: familyB, username: "filho_b", password: "senha-do-filho" });
    expect(joined?.family?.familyId).toBe(familyB);
    expect(joined?.family?.role).toBe("member");
    // The same code never works twice.
    expect(await findInviteByCode(raw, made.code)).not.toMatchObject({ status: "open" });
    expect(await acceptInvite(raw, { inviteId: (found as { id: string }).id, familyId: familyB, username: "outro", password: "senha-outro-x" })).toBeNull();

    const second = await createInvite(b, userB);
    if (second === "too_many") throw new Error("unexpected");
    expect(await revokeInvite(a, (await listInvites(b))[0]!.id)).toBe(false);
    expect(await revokeInvite(b, second.id)).toBe(true);
    expect(await findInviteByCode(raw, second.code)).not.toMatchObject({ status: "open" });

    const third = await createInvite(b, userB);
    if (third === "too_many") throw new Error("unexpected");
    await raw.query("UPDATE family_invites SET expires_at = now() - interval '1 minute' WHERE family_id = $1::uuid AND revoked_at IS NULL AND accepted_at IS NULL", [familyB]);
    expect(await findInviteByCode(raw, third.code)).not.toMatchObject({ status: "open" });
    expect(await findInviteByCode(raw, "codigo-que-nao-existe")).not.toMatchObject({ status: "open" });
  });

  test("a username is unique across families", async () => {
    await expect(insertFamilyUser(raw, ORIGINAL_FAMILY_ID, "dona_b", "outra-senha-x1")).rejects.toThrow();
  });

  test("an expired trial still reads but refuses writes with a clear error; the original family never expires", async () => {
    await raw.query("UPDATE families SET trial_ends_at = now() - interval '1 day' WHERE id = $1::uuid", [familyB]);
    const expired = familySql(raw, familyB, { neverExpires: false, trialEndsAt: new Date(Date.now() - 86400000).toISOString() });
    expect((await listAreas(expired, true)).length).toBeGreaterThan(0);
    await expect(createDog(expired, { name: "Tarde", breed: null, sex: "unknown", birth_date: null, weight_kg: null, notes: null })).rejects.toBeInstanceOf(TrialExpiredError);
    await createDog(a, { name: "Segue valendo", breed: null, sex: "unknown", birth_date: null, weight_kg: null, notes: null });
  });

  test("guard: every business table has family_id, row level security and a policy", async () => {
    const tables = await raw.query<{ name: string; rls: boolean; /* RLS on, or no privilege for the app role at all */ has_family: boolean; policies: number }>(`
      SELECT c.relname AS name,
             (c.relrowsecurity OR NOT has_table_privilege('casa_app', c.oid, 'SELECT, INSERT, UPDATE, DELETE')) AS rls,
             EXISTS (SELECT 1 FROM pg_attribute a WHERE a.attrelid = c.oid AND a.attname = 'family_id' AND NOT a.attisdropped) AS has_family,
             (SELECT count(*)::int FROM pg_policy p WHERE p.polrelid = c.oid) AS policies
      FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public' AND c.relkind = 'r'
      ORDER BY c.relname`);
    expect(tables.length).toBeGreaterThan(20);
    const problems: string[] = [];
    for (const table of tables) {
      if (!table.rls) problems.push(`${table.name}: row level security is off`);
      if (table.policies < 1 && table.name !== "sessions" && table.name !== "schema_migrations") problems.push(`${table.name}: no policy`);
      if (!table.has_family && !NOT_BUSINESS_TABLES[table.name] && table.name !== "users" ) problems.push(`${table.name}: no family_id`);
    }
    // Only the documented exceptions may lack family_id.
    const without = tables.filter((t) => !t.has_family).map((t) => t.name).sort();
    expect(without.filter((name) => !NOT_BUSINESS_TABLES[name])).toEqual([]);
    expect(problems.filter((p) => !p.startsWith("schema_migrations"))).toEqual([]);
  });

  test("guard: family_id has no default left that could fall back to another family", async () => {
    const rows = await raw.query<{ t: string; d: string }>(`
      SELECT table_name AS t, column_default AS d FROM information_schema.columns
      WHERE table_schema = 'public' AND column_name = 'family_id' AND column_default IS NOT NULL
        AND column_default NOT LIKE '%app_family_id()%'`);
    expect(rows).toEqual([]);
  });

  test("the legacy webhook and environment key resolve to the original family", async () => {
    const { findOriginalFamilyScope, listBotFamilyScopes } = await import("@/lib/repositories/families");
    expect((await findOriginalFamilyScope(raw))?.familyId).toBe(ORIGINAL_FAMILY_ID);
    expect(scopeFor(ORIGINAL_FAMILY_ID).neverExpires).toBe(true);
    expect(Array.isArray(await listBotFamilyScopes(raw))).toBe(true);
  });
});
