/**
 * Round trips of the finance pages on a real Postgres. Skipped unless TEST_DATABASE_URL is set.
 *
 *   TEST_DATABASE_URL=postgresql://casa:casa@localhost:5432/casa_test npx vitest run tests/integration/finance-queries-db.test.ts
 */
import { beforeAll, describe, expect, test } from "vitest";
import { createSql, type Sql } from "@/lib/db/client";
import { applyMigrations } from "@/lib/db/migrate";
import { parseBillCreate } from "@/lib/domain/finance/validate";
import { createBill, payBill } from "@/lib/services/finance/bills";
import { getBudgetView } from "@/lib/services/finance/budgets";
import { billsPageData } from "@/lib/services/finance-pages";

const url = process.env.TEST_DATABASE_URL;
const TODAY = "2026-10-17";

function must<T>(result: { ok: true; value: T } | { ok: false; details: unknown }): T {
  if (!result.ok) throw new Error(JSON.stringify(result.details));
  return result.value;
}

/** Counts statements and how many waves of them ran one after another. */
function counting(sql: Sql) {
  const stats = { queries: 0, rounds: 0, inFlight: 0 };
  const wrapped: Sql = {
    async query(text, params) {
      stats.queries += 1;
      if (stats.inFlight === 0) stats.rounds += 1;
      stats.inFlight += 1;
      try {
        return await sql.query(text, params);
      } finally {
        stats.inFlight -= 1;
      }
    },
  };
  return { sql: wrapped, stats };
}

describe.skipIf(!url)("finance page queries", () => {
  let sql: Sql;

  beforeAll(async () => {
    if (!url || !/test/.test(url)) throw new Error("TEST_DATABASE_URL must name a test database.");
    process.env.DATABASE_DRIVER = "pg";
    sql = createSql(url);
    await sql.query("DROP SCHEMA IF EXISTS public CASCADE");
    await sql.query("CREATE SCHEMA public");
    await applyMigrations(sql);
    const names = ["Aluguel", "Energia", "Água", "Internet", "Telefone", "Escola", "Plano de saúde"];
    for (const [index, name] of names.entries()) {
      const slug = `conta_${index}`;
      await createBill(sql, must(parseBillCreate({ slug, name, amount_cents: 10000 + index, category: "moradia", next_due_date: `2026-09-${10 + index}` })));
      for (const month of ["09", "10"]) {
        await payBill(sql, slug, { paid_on: `2026-${month}-0${index + 1}`, amount_cents: 10000, account: null, notes: null, external_key: `t:${slug}:${month}` }, TODAY);
      }
    }
  });

  test("A pagar costs 2 queries whatever the number of bills, with the payments of each", async () => {
    const { sql: counted, stats } = counting(sql);
    const page = await billsPageData(counted, TODAY);
    expect(page.active).toHaveLength(7);
    expect(stats.queries).toBe(2);
    for (const bill of page.active) {
      expect(bill.payments).toHaveLength(2);
      expect(bill.payments.every((payment) => payment.bill_id === bill.id)).toBe(true);
      expect(bill.payments[0]!.date >= bill.payments[1]!.date).toBe(true);
    }
  });

  test("the budget view is a single round trip", async () => {
    const { sql: counted, stats } = counting(sql);
    await getBudgetView(counted, "2026-10");
    expect(stats.rounds).toBe(1);
  });
});
