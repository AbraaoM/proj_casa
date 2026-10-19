/**
 * Identity on a real Postgres: no seeded account, the old initial password flagged by 007,
 * existing keys moved to the first master account, and every agent write attributed to the
 * person and the key (REST and MCP), with the ask-cost flow. Skipped unless TEST_DATABASE_URL is set.
 *
 *   TEST_DATABASE_URL=postgresql://casa:casa@localhost:5432/casa_test npx vitest run tests/integration/identity-db.test.ts
 */
import { beforeAll, describe, expect, test, vi } from "vitest";
import { createSql, type Sql } from "@/lib/db/client";
import { applyMigrations } from "@/lib/db/migrate";
import { newAgentKey } from "@/lib/agent/keys";

// Tool results are read field by field in the assertions below.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Loose = Record<string, any>;

const url = process.env.TEST_DATABASE_URL;

describe.skipIf(!url)("identity and attribution", () => {
  let sql: Sql;
  let ownerId = "";
  let memberId = "";
  let legacyKeyToken = "";
  let memberToken = "";
  let memberKeyId = "";
  let dogId = "";

  const n = async (query: string, params: unknown[] = []) => Number((await sql.query<{ n: unknown }>(query, params))[0]?.n ?? 0);

  beforeAll(async () => {
    if (!url || !/test/.test(url)) throw new Error("TEST_DATABASE_URL must name a test database.");
    vi.stubEnv("DATABASE_DRIVER", "pg");
    vi.stubEnv("DATABASE_URL", url);
    vi.stubEnv("AGENT_API_KEY", "");
    sql = createSql(url);
    await sql.query("DROP SCHEMA IF EXISTS public CASCADE");
    await sql.query("CREATE SCHEMA public");
    await applyMigrations(sql, { until: "006_medication_doses" });

    // An install from before: the account on the initial password and a key with no owner.
    expect(await n("SELECT count(*)::int AS n FROM users")).toBe(0);
    const [legacy] = await sql.query<{ id: string }>(
      "INSERT INTO users (username, password_hash, role) VALUES ('dono', crypt('admin', gen_salt('bf')), 'admin') RETURNING id::text AS id",
    );
    ownerId = legacy!.id;
    const legacyKey = newAgentKey();
    legacyKeyToken = legacyKey.token;
    await sql.query("INSERT INTO agent_keys (label, key_prefix, key_hash) VALUES ('Agente antigo', $1, $2)", [legacyKey.prefix, legacyKey.hash]);

    await applyMigrations(sql);
  });

  test("a fresh database has no account; the first one is created once, as master", async () => {
    const fresh = createSql(url!);
    const { insertFirstUser, countUsers } = await import("@/lib/repositories/accounts");
    // On the migrated database there is already an account: no second "first" account.
    expect(await insertFirstUser(fresh, "outra", "senha-segura")).toBeNull();
    expect(await countUsers(fresh)).toBe(1);
  });

  test("007 flags the initial password and gives the ownerless key to the first master", async () => {
    const [owner] = await sql.query<{ must_change_password: boolean; password_is_default: boolean }>(
      "SELECT must_change_password, password_is_default FROM users WHERE id = $1::uuid",
      [ownerId],
    );
    expect(owner).toEqual({ must_change_password: true, password_is_default: true });
    expect(await n("SELECT count(*)::int AS n FROM agent_keys WHERE created_by = $1::uuid", [ownerId])).toBe(1);
  });

  test("changing one's own password clears the flags; a master reset forces a new one", async () => {
    const { updateOwnPassword, updateUserPassword, insertUser, findUserByPassword } = await import("@/lib/repositories/accounts");
    expect(await updateOwnPassword(sql, ownerId, "senha-nova-dono", "errada")).toBe(false);
    expect(await updateOwnPassword(sql, ownerId, "senha-nova-dono", "admin")).toBe(true);
    const owner = await findUserByPassword(sql, "dono", "senha-nova-dono");
    expect(owner).toMatchObject({ mustChangePassword: false, passwordIsDefault: false });

    const member = await insertUser(sql, "pessoa", "senha-da-pessoa");
    memberId = member.id;
    expect(await updateUserPassword(sql, memberId, "temporaria-123")).toBe(true);
    expect(await findUserByPassword(sql, "pessoa", "temporaria-123")).toMatchObject({ mustChangePassword: true });
  });

  test("the old key keeps working and now acts as its owner", async () => {
    const { authorizeToken } = await import("@/lib/agent/auth");
    const result = await authorizeToken(legacyKeyToken);
    expect(result).toEqual({ ok: true, caller: { userId: ownerId, username: "dono", keyId: expect.any(String), agentName: "Agente antigo" } });
  });

  test("REST writes record the person and the key, and an activity row", async () => {
    const { insertAgentKey } = await import("@/lib/repositories/agent-keys");
    const key = newAgentKey();
    memberToken = key.token;
    await insertAgentKey(sql, { label: "Assistente", prefix: key.prefix, hash: key.hash, createdBy: memberId });
    memberKeyId = (await sql.query<{ id: string }>("SELECT id::text AS id FROM agent_keys WHERE key_hash = $1", [key.hash]))[0]!.id;

    const { POST: postDog } = await import("@/app/api/agent/dogs/route");
    const dog = await postDog(new Request("http://localhost/api/agent/dogs", { method: "POST", headers: { authorization: `Bearer ${memberToken}` }, body: JSON.stringify({ name: "Bolinha" }) }));
    expect(dog.status).toBe(201);
    dogId = (await dog.json()).data.dog.id;

    const { POST: postItem } = await import("@/app/api/agent/items/route");
    const response = await postItem(
      new Request("http://localhost/api/agent/items", {
        method: "POST",
        headers: { authorization: `Bearer ${memberToken}` },
        body: JSON.stringify({ domain: "dog", dog_id: dogId, title: "Consulta", category: "vet", due_date: "2026-10-20" }),
      }),
    );
    expect(response.status).toBe(201);
    const itemId = (await response.json()).data.item.id;
    const [row] = await sql.query<{ u: string; k: string }>("SELECT created_by_user_id::text AS u, agent_key_id::text AS k FROM care_items WHERE id = $1::uuid", [itemId]);
    expect(row).toEqual({ u: memberId, k: memberKeyId });
    expect(await n("SELECT count(*)::int AS n FROM agent_activity WHERE user_id = $1::uuid AND agent_key_id = $2::uuid AND channel = 'rest' AND action = 'POST /api/agent/items' AND status = 201", [memberId, memberKeyId])).toBe(1);
  });

  async function mcp(token: string, method: string, params: unknown) {
    const { POST } = await import("@/app/api/mcp/route");
    const response = await POST(
      new Request("http://localhost/api/mcp", {
        method: "POST",
        headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
        body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
      }),
    );
    return (await response.json()) as { result: { isError: boolean; structuredContent: { ok: boolean; data: Loose; error?: { message: string } } } };
  }

  test("MCP: marcar_feito asks the cost, registrar_custo records it once, as the same person", async () => {
    const list = await mcp(memberToken, "tools/call", { name: "atencao_hoje", arguments: { within_days: 30 } });
    const item = list.result.structuredContent.data.items.find((entry: { title: string }) => entry.title === "Consulta");
    expect(item).toBeDefined();

    const done = await mcp(memberToken, "tools/call", { name: "marcar_feito", arguments: { item_id: item.id } });
    expect(done.result.isError).toBe(false);
    expect(done.result.structuredContent.data.ask_cost).toBe(true);
    const eventId = done.result.structuredContent.data.event.id;
    expect(await n("SELECT count(*)::int AS n FROM fin_transactions WHERE care_event_id = $1::uuid", [eventId])).toBe(0);

    const [event] = await sql.query<{ u: string; k: string }>("SELECT created_by_user_id::text AS u, agent_key_id::text AS k FROM care_events WHERE id = $1::uuid", [eventId]);
    expect(event).toEqual({ u: memberId, k: memberKeyId });

    // Someone else's agent cannot attach a cost to this person's task.
    const other = await mcp(legacyKeyToken, "tools/call", { name: "registrar_custo", arguments: { event_id: eventId, amount_cents: 15000 } });
    expect(other.result.isError).toBe(true);
    expect(other.result.structuredContent.error?.message).toContain("someone else");

    const cost = await mcp(memberToken, "tools/call", { name: "registrar_custo", arguments: { event_id: eventId, amount_cents: 15000 } });
    expect(cost.result.isError).toBe(false);
    const [tx] = await sql.query<{ amount_cents: number; u: string; k: string }>(
      "SELECT amount_cents::int AS amount_cents, created_by_user_id::text AS u, agent_key_id::text AS k FROM fin_transactions WHERE care_event_id = $1::uuid AND voided_at IS NULL",
      [eventId],
    );
    expect(tx).toEqual({ amount_cents: 15000, u: memberId, k: memberKeyId });

    const again = await mcp(memberToken, "tools/call", { name: "registrar_custo", arguments: { event_id: eventId, amount_cents: 20000 } });
    expect(again.result.isError).toBe(true);
    expect(await n("SELECT count(*)::int AS n FROM agent_activity WHERE channel = 'mcp' AND action = 'tool registrar_custo'")).toBe(3);
  });

  test("a cleaning task does not ask for a cost", async () => {
    const created = await mcp(memberToken, "tools/call", { name: "adicionar_item", arguments: { domain: "house", title: "Limpar a varanda", category: "cleaning" } });
    const done = await mcp(memberToken, "tools/call", { name: "marcar_feito", arguments: { item_id: created.result.structuredContent.data.item.id } });
    expect(done.result.structuredContent.data.ask_cost).toBe(false);
  });

  test("a member revokes only their own keys; a master revokes any", async () => {
    const { revokeAgentKey } = await import("@/lib/repositories/agent-keys");
    const ownerKey = (await sql.query<{ id: string }>("SELECT id::text AS id FROM agent_keys WHERE created_by = $1::uuid", [ownerId]))[0]!.id;
    expect(await revokeAgentKey(sql, ownerKey, { id: memberId, role: "member" })).toBe(false);
    expect(await revokeAgentKey(sql, memberKeyId, { id: ownerId, role: "admin" })).toBe(true);
  });
});
