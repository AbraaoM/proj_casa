/**
 * The house checklist on a real Postgres: due dates of new routines, who did it, the sheet,
 * frequency changes through the agent tools, and an undo. Skipped unless TEST_DATABASE_URL is set.
 *
 *   TEST_DATABASE_URL=postgresql://casa:casa@localhost:5432/casa_test npx vitest run tests/integration/routines-db.test.ts
 */
import { beforeAll, describe, expect, test } from "vitest";
import { withCaller, type AgentCaller } from "@/lib/agent/actor";
import { AGENT_TOOLS, type ToolContext } from "@/lib/agent/tools";
import { createSql, type Sql } from "@/lib/db/client";
import { applyMigrations } from "@/lib/db/migrate";
import { parseAreaCreate } from "@/lib/domain/areas";
import { addDays, todayInTimeZone } from "@/lib/domain/dates";
import { parseCreateItem } from "@/lib/domain/validate";
import { createArea } from "@/lib/services/areas";
import { createItem } from "@/lib/services/items";
import { tapDone, undoTap } from "@/lib/services/one-tap";
import { listRoutines, loadSheet } from "@/lib/services/routines";
import { readSettings } from "@/lib/services/settings";

const url = process.env.TEST_DATABASE_URL;
const KEY = "chave-de-teste-rotinas";

function must<T>(result: { ok: true; value: T } | { ok: false; details: unknown }): T {
  if (!result.ok) throw new Error(JSON.stringify(result.details));
  return result.value;
}

function tool(name: string) {
  const found = AGENT_TOOLS.find((entry) => entry.name === name);
  if (!found) throw new Error(`missing ${name}`);
  return found;
}

describe.skipIf(!url)("house routines", () => {
  let sql: Sql;
  let today: string;
  let timeZone: string;
  let context: ToolContext;
  let person: AgentCaller;

  const routines = (area: string | null = null) => listRoutines(sql, { area, status: null, limit: null, today, timeZone });

  beforeAll(async () => {
    if (!url || !/test/.test(url)) throw new Error("TEST_DATABASE_URL must name a test database.");
    process.env.DATABASE_DRIVER = "pg";
    process.env.DATABASE_URL = url;
    process.env.AGENT_API_KEY = KEY;
    sql = createSql(url);
    await sql.query("DROP SCHEMA IF EXISTS public CASCADE");
    await sql.query("CREATE SCHEMA public");
    await applyMigrations(sql);
    timeZone = (await readSettings(sql)).timezone;
    today = todayInTimeZone(timeZone);
    context = { sql, today, clock: { now: new Date().toISOString(), timeZone } };
    await createArea(sql, must(parseAreaCreate({ slug: "banheiro_teste", name: "Banheiro teste" })));
    await createArea(sql, must(parseAreaCreate({ slug: "quarto_teste", name: "Quarto teste" })));
    const [user] = await sql.query<{ id: string }>("INSERT INTO users (username, password_hash) VALUES ('pessoa_a', 'x') RETURNING id", []);
    person = { userId: user!.id, username: "pessoa_a", keyId: null, agentName: null };
  });

  test("a new routine is due today when never done, or one interval after the last time", async () => {
    const fresh = await createItem(sql, must(parseCreateItem({ domain: "house", area: "banheiro_teste", title: "Limpeza do banheiro", category: "cleaning", interval_days: 3 })));
    expect(fresh.item.due_date).toBe(today);
    const known = await createItem(
      sql,
      must(parseCreateItem({ domain: "house", area: "quarto_teste", title: "Trocar roupa de cama", category: "cleaning", interval_days: 7, last_done_on: addDays(today, -2) })),
    );
    expect(known.item.due_date).toBe(addDays(today, 5));
    const oneOff = await createItem(sql, must(parseCreateItem({ domain: "house", area: "quarto_teste", title: "Trocar lâmpada", category: "repair" })));
    expect(oneOff.item.due_date).toBeNull();

    const list = await routines();
    expect(list.map((entry) => [entry.title, entry.state.status])).toEqual([
      ["Limpeza do banheiro", "never"],
      ["Trocar roupa de cama", "ok"],
    ]);
  });

  test("Feito agora records who did it, shows on the sheet, and Desfazer takes it back", async () => {
    const [routine] = await routines("banheiro_teste");
    const tap = await withCaller(person, "panel", () => tapDone(sql, routine!.id, routine!.due_date, today));
    if (!tap.ok) throw new Error(tap.message);

    const [after] = await routines("banheiro_teste");
    expect(after!.state).toMatchObject({ status: "ok", days_since: 0, due_date: addDays(today, 3) });
    expect(after!.last).toMatchObject({ by: "pessoa_a", via_agent: false, done_on: today });
    expect(after!.last!.time).toMatch(/^\d{2}:\d{2}$/);

    const sheet = await loadSheet(sql, { routines: [{ id: after!.id, title: after!.title }], today, days: 7, timeZone });
    expect(sheet.days.at(-1)).toBe(today);
    expect(sheet.rows[0]!.cells.at(-1)!.marks.map((mark) => mark.by)).toEqual(["pessoa_a"]);

    const undo = await undoTap(sql, tap.undo, today);
    expect(undo.ok).toBe(true);
    const [undone] = await routines("banheiro_teste");
    expect(undone!.last).toBeNull();
    expect(undone!.state.status).toBe("never");
    const empty = await loadSheet(sql, { routines: [{ id: undone!.id, title: undone!.title }], today, days: 7, timeZone });
    expect(empty.rows[0]!.cells.every((cell) => cell.marks.length === 0)).toBe(true);
  });

  test("rotinas_casa lists the checklist and can add the suggested kit", async () => {
    const result = (await tool("rotinas_casa").run({ include_kit: true }, context)) as {
      routines: Array<Record<string, unknown>>;
      suggested_kit: unknown[];
    };
    expect(result.routines[0]).toMatchObject({ title: "Limpeza do banheiro", area: "banheiro_teste", status: "never", interval_days: 3, done_by: null });
    expect(result.suggested_kit.length).toBeGreaterThan(5);
    const late = (await tool("rotinas_casa").run({ status: "ok" }, context)) as { routines: Array<{ title: string }> };
    expect(late.routines.map((entry) => entry.title)).toEqual(["Trocar roupa de cama"]);
    await expect(tool("rotinas_casa").run({ status: "late" }, context)).rejects.toThrow();
  });

  test("the frequency changes only through atualizar_item: new interval moves the due date, null removes it", async () => {
    const [bed] = await routines("quarto_teste");
    const changed = (await tool("atualizar_item").run({ item_id: bed!.id, interval_days: 14 }, context)) as { item: { due_date: string } };
    expect(changed.item.due_date).toBe(addDays(today, 12));
    const monthly = (await tool("atualizar_item").run({ item_id: bed!.id, interval_months: 1 }, context)) as { item: { due_date: string } };
    expect(monthly.item.due_date > today).toBe(true);
    expect((await routines("quarto_teste"))[0]!.interval_months).toBe(1);

    await tool("atualizar_item").run({ item_id: bed!.id, interval_months: null }, context);
    expect(await routines("quarto_teste")).toEqual([]);
  });

  test("adicionar_item with the routine key is idempotent and takes last_done_on", async () => {
    const args = {
      domain: "house", area: "quarto_teste", title: "Aspirar e passar pano", category: "cleaning",
      interval_days: 7, last_done_on: addDays(today, -10), external_key: "rotina:quarto_teste:aspirar_e_passar_pano",
    };
    const first = (await tool("adicionar_item").run(args, context)) as { item: { id: string; due_date: string }; idempotent_replay: boolean };
    const again = (await tool("adicionar_item").run(args, context)) as { item: { id: string }; idempotent_replay: boolean };
    expect(first.item.due_date).toBe(addDays(today, -3));
    expect(again).toMatchObject({ idempotent_replay: true, item: { id: first.item.id } });
    const [aspirar] = await routines("quarto_teste");
    expect(aspirar!.state).toMatchObject({ status: "overdue", days_overdue: 3, days_since: 10 });
  });

  test("GET /api/agent/house/routines returns the same checklist, filters, and rejects a bad status", async () => {
    const { GET } = await import("@/app/api/agent/house/routines/route");
    const get = (query: string) =>
      GET(new Request(`http://casa.test/api/agent/house/routines${query}`, { headers: { Authorization: `Bearer ${KEY}` } }));
    const all = await (await get("")).json();
    expect(all.data.as_of).toBe(today);
    expect(all.data.routines.map((entry: { title: string }) => entry.title)).toEqual(["Aspirar e passar pano", "Limpeza do banheiro"]);
    expect(all.data).not.toHaveProperty("suggested_kit");
    const room = await (await get("?area=banheiro_teste&include_kit=true")).json();
    expect(room.data.routines).toHaveLength(1);
    expect(room.data.suggested_kit.length).toBeGreaterThan(5);
    const bad = await get("?status=late");
    expect(bad.status).toBe(400);
  });
});
