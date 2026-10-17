/**
 * POST /api/agent/finance/bills/bulk on a real Postgres. Skipped unless TEST_DATABASE_URL is set.
 */
import { beforeAll, describe, expect, test } from "vitest";
import { createSql, type Sql } from "@/lib/db/client";
import { applyMigrations } from "@/lib/db/migrate";

const url = process.env.TEST_DATABASE_URL;
const KEY = "chave-de-teste-bulk";

describe.skipIf(!url)("bills bulk", () => {
  let sql: Sql;
  let POST: (request: Request) => Promise<Response>;

  beforeAll(async () => {
    if (!url || !/test/.test(url)) throw new Error("TEST_DATABASE_URL must name a test database.");
    process.env.DATABASE_DRIVER = "pg";
    process.env.DATABASE_URL = url;
    process.env.AGENT_API_KEY = KEY;
    sql = createSql(url);
    await sql.query("DROP SCHEMA IF EXISTS public CASCADE");
    await sql.query("CREATE SCHEMA public");
    await applyMigrations(sql);
    ({ POST } = await import("@/app/api/agent/finance/bills/bulk/route"));
  });

  const send = (items: unknown[]) =>
    POST(
      new Request("http://casa.test/api/agent/finance/bills/bulk", {
        method: "POST",
        headers: { Authorization: `Bearer ${KEY}`, "Content-Type": "application/json" },
        body: JSON.stringify({ items }),
      }),
    );

  const items = [
    { slug: "aluguel", name: "Aluguel", amount_cents: 180000, category: "aluguel", next_due_date: "2026-11-05" },
    { slug: "energia", name: "Energia", amount_cents: 21000, amount_varies: true, category: "energia", next_due_date: "2026-11-10" },
    { slug: "ruim", name: "Sem categoria", amount_cents: 1000, next_due_date: "2026-11-10" },
    { slug: "errada", name: "Categoria de entrada", amount_cents: 1000, category: "salario", next_due_date: "2026-11-10" },
  ];

  test("each entry gets its own ok, and the bad ones do not stop the good ones", async () => {
    const response = await send(items);
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.meta).toEqual({ succeeded: 2, failed: 2 });
    expect(body.data.results.map((result: { ok: boolean }) => result.ok)).toEqual([true, true, false, false]);
    expect(body.data.results[2].error.code).toBe("validation_error");
    expect(body.data.results[3].error.code).toBe("validation_error");
    expect(body.data.results[0].meta.idempotent_replay).toBe(false);
  });

  test("sending it again changes nothing", async () => {
    const body = await (await send(items.slice(0, 2))).json();
    expect(body.data.results.every((result: { meta: { idempotent_replay: boolean } }) => result.meta.idempotent_replay)).toBe(true);
    const [bills, reminders] = await Promise.all([
      sql.query<{ n: number }>("SELECT count(*)::int AS n FROM fin_bills"),
      sql.query<{ n: number }>("SELECT count(*)::int AS n FROM care_items WHERE domain = 'finance'"),
    ]);
    expect(bills[0]!.n).toBe(2);
    expect(reminders[0]!.n).toBe(2);
  });

  test("more than 50 entries is refused as a whole, in JSON", async () => {
    const response = await send(Array.from({ length: 51 }, (_, index) => ({ ...items[0], slug: `c${index}` })));
    expect(response.status).toBe(400);
    expect((await response.json()).ok).toBe(false);
  });
});
