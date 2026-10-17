/**
 * Finance on a real Postgres. Skipped unless TEST_DATABASE_URL is set (see history-db.test.ts).
 *
 *   TEST_DATABASE_URL=postgresql://casa:casa@localhost:5432/casa_test npm run test:db
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { beforeAll, describe, expect, test } from "vitest";
import { createSql, type Sql } from "@/lib/db/client";
import { applyMigrations, MIGRATIONS_DIR } from "@/lib/db/migrate";
import { splitSql } from "@/lib/db/split-sql";
import type { CreateEventInput } from "@/lib/domain/events";
import { SECTOR_MAP_SAMPLES, sectorCategory } from "@/lib/domain/finance/sector-map";
import {
  parseAccountCreate,
  parseBillCreate,
  parseTransactionCreate,
  parseTransactionListQuery,
} from "@/lib/domain/finance/validate";
import * as itemsRepo from "@/lib/repositories/items";
import { completeItem, createEvent, updateEvent } from "@/lib/services/events";
import { addBalanceCheck, createAccount, getAccountView, reconcileAccount } from "@/lib/services/finance/accounts";
import { createBill, getBillView, payBill, updateBill } from "@/lib/services/finance/bills";
import { getBudgetView, putBudgets } from "@/lib/services/finance/budgets";
import { createCategory } from "@/lib/services/finance/categories";
import { getFinanceSummary } from "@/lib/services/finance/summary";
import { createTransaction, listTransactions, updateTransaction } from "@/lib/services/finance/transactions";

const url = process.env.TEST_DATABASE_URL;
const TODAY = "2026-10-16";

function must<T>(result: { ok: true; value: T } | { ok: false; details: unknown }): T {
  if (!result.ok) throw new Error(JSON.stringify(result.details));
  return result.value;
}

function eventInput(overrides: Partial<CreateEventInput>): CreateEventInput {
  return {
    care_item_id: null, domain: null, dog_id: null, family_member_id: null, vehicle_id: null, area_id: null,
    area_slug: null, category: null, title: null, done_on: null, notes: null, provider: null, weight_kg: null,
    odometer_km: null, amount_cents: null, external_key: null, ...overrides,
  };
}

const list = (query: string) => must(parseTransactionListQuery(new URLSearchParams(query)));

describe.skipIf(!url)("finance on Postgres", () => {
  let sql: Sql;
  let dogId = "";

  beforeAll(async () => {
    if (!url || !/test/.test(url)) throw new Error("TEST_DATABASE_URL must name a test database.");
    process.env.DATABASE_DRIVER = "pg";
    sql = createSql(url);
    await sql.query("DROP SCHEMA IF EXISTS public CASCADE");
    await sql.query("CREATE SCHEMA public");

    // Before 005: one costed event for every mapped (domain, category), plus a voided and a free one.
    await applyMigrations(sql, { until: "004_history_areas" });
    const [dog] = await sql.query<{ id: string }>("INSERT INTO dogs (name) VALUES ('Thor') RETURNING id");
    const [car] = await sql.query<{ id: string }>("INSERT INTO vehicles (name) VALUES ('Onix') RETURNING id");
    const [person] = await sql.query<{ id: string }>("INSERT INTO family_members (name) VALUES ('Ana') RETURNING id");
    dogId = dog!.id;
    const subject: Record<string, [string, string] | null> = {
      dog: ["dog_id", dogId], car: ["vehicle_id", car!.id], family: ["family_member_id", person!.id], house: null, finance: null,
    };
    for (const [index, [domain, category]] of SECTOR_MAP_SAMPLES.entries()) {
      const column = subject[domain];
      await sql.query(
        `INSERT INTO care_events (domain, ${column ? `${column[0]},` : ""} category, title, done_on, amount_cents, external_key)
         VALUES ($1, ${column ? "$6::uuid," : ""} $2, $3, '2026-09-10', $4, $5)`,
        [domain, category, `${domain} ${category}`, 1000 + index, `legacy:${index}`, ...(column ? [column[1]] : [])],
      );
    }
    await sql.query(
      `INSERT INTO care_events (domain, dog_id, category, title, done_on, amount_cents, voided_at)
       VALUES ('dog', $1, 'vet', 'Anulado', '2026-09-11', 5000, now()), ('dog', $1, 'vet', 'Grátis', '2026-09-12', 0, NULL)`,
      [dogId],
    );
    await applyMigrations(sql);
  });

  test("005 seeds categories and backfills live costs with the same mapping as the code", async () => {
    const [{ n }] = (await sql.query<{ n: number }>("SELECT count(*)::int AS n FROM fin_categories")) as [{ n: number }];
    expect(n).toBe(35);
    const rows = await sql.query<{ title: string; slug: string; amount_cents: string; source: string }>(
      `SELECT e.title, c.slug, t.amount_cents::text, t.source FROM fin_transactions t
       JOIN care_events e ON e.id = t.care_event_id JOIN fin_categories c ON c.id = t.category_id`,
    );
    expect(rows).toHaveLength(SECTOR_MAP_SAMPLES.length);
    for (const [domain, category] of SECTOR_MAP_SAMPLES) {
      const row = rows.find((candidate) => candidate.title === `${domain} ${category}`);
      expect(row?.slug, `${domain}/${category}`).toBe(sectorCategory(domain, category));
      expect(row?.source).toBe("care_event");
    }
  });

  test("005 can run again statement by statement without duplicates", async () => {
    const source = readFileSync(path.join(MIGRATIONS_DIR, "005_finance.sql"), "utf8");
    for (const statement of splitSql(source)) await sql.query(statement);
    const [cats] = await sql.query<{ n: number }>("SELECT count(*)::int AS n FROM fin_categories");
    const [txs] = await sql.query<{ n: number }>("SELECT count(*)::int AS n FROM fin_transactions");
    expect(cats?.n).toBe(35);
    expect(txs?.n).toBe(SECTOR_MAP_SAMPLES.length);
  });

  test("the database refuses a transfer with a category and an item with both intervals", async () => {
    const [cat] = await sql.query<{ id: string }>("SELECT id FROM fin_categories WHERE slug = 'outros'");
    await expect(
      sql.query(
        "INSERT INTO fin_transactions (kind, date, amount_cents, category_id, description) VALUES ('transfer', '2026-10-01', 1, $1, 'x')",
        [cat!.id],
      ),
    ).rejects.toThrow(/fin_transactions_shape/);
    await expect(
      sql.query("INSERT INTO care_items (domain, title, category, interval_days, interval_months) VALUES ('finance', 'x', 'bill', 30, 1)"),
    ).rejects.toThrow(/care_items_single_interval/);
  });

  test("accounts are idempotent by slug and start from the opening balance", async () => {
    const itau = await createAccount(sql, must(parseAccountCreate({ slug: "itau", name: "Itaú", kind: "checking", opening_balance_cents: 500000 })), TODAY);
    expect(itau.idempotentReplay).toBe(false);
    expect(itau.account.balance_cents).toBe(500000);
    const again = await createAccount(sql, must(parseAccountCreate({ slug: "itau", name: "Outro", kind: "cash" })), TODAY);
    expect(again).toMatchObject({ idempotentReplay: true, account: { name: "Itaú" } });
    await createAccount(
      sql,
      must(parseAccountCreate({ slug: "nubank", name: "Nubank", kind: "credit_card", credit_limit_cents: 300000, statement_close_day: 5, due_day: 12 })),
      TODAY,
    );
  });

  test("a sector cost flows into finance and follows the event", async () => {
    const created = await createEvent(
      sql,
      eventInput({ domain: "dog", dog_id: dogId, category: "vet", title: "Consulta — otite", done_on: "2026-10-05", amount_cents: 18000, account: "itau", provider: "Clínica Pinda" }),
      TODAY,
    );
    expect(created.transaction).toMatchObject({
      kind: "expense", amount_cents: 18000, category_slug: "pets_saude", account_slug: "itau",
      source: "care_event", origin_domain: "dog", origin_subject_name: "Thor", payee: "Clínica Pinda",
    });
    const txId = created.transaction!.id;

    await expect(updateTransaction(sql, txId, { amount_cents: 1 })).rejects.toThrow(/PATCH \/api\/agent\/events/);
    expect((await updateTransaction(sql, txId, { category: "pets" })).category_slug).toBe("pets");

    const changed = await updateEvent(sql, created.event.id, { amount_cents: 20000 }, TODAY);
    expect(changed.transaction).toMatchObject({ amount_cents: 20000, category_slug: "pets" });
    const voided = await updateEvent(sql, created.event.id, { voided: true }, TODAY);
    expect(voided.transaction?.voided_at).not.toBeNull();
    const back = await updateEvent(sql, created.event.id, { voided: false }, TODAY);
    expect(back.transaction?.voided_at).toBeNull();

    const fromDog = await listTransactions(sql, list(`origin=dog:${dogId}&month=2026-10`));
    expect(fromDog.transactions.map((tx) => tx.id)).toEqual([txId]);
    expect((await getAccountView(sql, "itau", TODAY)).balance_cents).toBe(500000 - 20000);
  });

  test("an unknown finance_category is refused before the event is written", async () => {
    const before = await sql.query("SELECT count(*)::int AS n FROM care_events");
    await expect(
      createEvent(sql, eventInput({ domain: "house", category: "repair", title: "x", amount_cents: 100, finance_category: "nao_existe" }), TODAY),
    ).rejects.toThrow(/finance_category/);
    expect(await sql.query("SELECT count(*)::int AS n FROM care_events")).toEqual(before);
  });

  test("a bill gets a finance reminder; paying moves both and records one transaction", async () => {
    const { bill } = await createBill(
      sql,
      must(parseBillCreate({ slug: "energia", name: "Energia", amount_cents: 21000, amount_varies: true, category: "energia", account: "itau", next_due_date: "2026-10-10" })),
    );
    const item = await itemsRepo.getItem(sql, bill.care_item_id!);
    expect(item).toMatchObject({ domain: "finance", title: "Energia", due_date: "2026-10-10", status: "active" });

    const paid = await payBill(sql, "energia", { paid_on: "2026-10-09", amount_cents: 19873, account: null, notes: null, external_key: "pay:energia:2026-10" }, TODAY);
    expect(paid.transaction).toMatchObject({ source: "bill", bill_slug: "energia", amount_cents: 19873, category_slug: "energia", account_slug: "itau", date: "2026-10-09" });
    expect(paid.bill.next_due_date).toBe("2026-11-10");
    expect(paid.item.due_date).toBe("2026-11-10");

    const replay = await payBill(sql, "energia", { paid_on: "2026-10-09", amount_cents: 19873, account: null, notes: null, external_key: "pay:energia:2026-10" }, TODAY);
    expect(replay.idempotentReplay).toBe(true);
    expect(replay.transaction?.id).toBe(paid.transaction?.id);

    // Marking the bill's item done is the same as paying the bill.
    const done = await completeItem(sql, bill.care_item_id!, {
      done_on: TODAY, notes: null, external_key: null, weight_kg: null, odometer_km: null, amount_cents: null, provider: null,
    }, TODAY);
    expect(done.transaction).toMatchObject({ source: "bill", amount_cents: 21000 });
    expect(done.item?.due_date).toBe("2026-12-10");
    expect((await getBillView(sql, "energia")).payments).toHaveLength(2);
  });

  test("a suggested bill waits paused until confirmed", async () => {
    const { bill } = await createBill(
      sql,
      must(parseBillCreate({ slug: "netflix", name: "Netflix", kind: "subscription", amount_cents: 5590, category: "assinaturas", next_due_date: "2026-10-20", status: "suggested" })),
    );
    expect((await itemsRepo.getItem(sql, bill.care_item_id!))?.status).toBe("paused");
    await expect(payBill(sql, "netflix", { paid_on: null, amount_cents: null, account: null, notes: null, external_key: null }, TODAY)).rejects.toThrow(/suggested/);
    const confirmed = await updateBill(sql, "netflix", { status: "active" });
    expect((await itemsRepo.getItem(sql, confirmed.care_item_id!))?.status).toBe("active");
    await expect(
      createBill(sql, must(parseBillCreate({ slug: "salario", name: "Salário", kind: "income", amount_cents: 1, category: "outros", next_due_date: "2026-11-05" }))),
    ).rejects.toThrow(/income category/);
  });

  test("card installments, card payment, income and balances", async () => {
    const bought = await createTransaction(
      sql,
      must(parseTransactionCreate({ kind: "expense", date: "2026-10-08", amount_cents: 100000, installments: 3, account: "nubank", category: "casa", description: "Geladeira", external_key: "geladeira" })),
    );
    expect(bought.transactions.map((tx) => [tx.date, tx.amount_cents, tx.installment_n])).toEqual([
      ["2026-10-08", 33334, 1], ["2026-11-08", 33333, 2], ["2026-12-08", 33333, 3],
    ]);
    const replay = await createTransaction(
      sql,
      must(parseTransactionCreate({ kind: "expense", date: "2026-10-08", amount_cents: 100000, installments: 3, account: "nubank", category: "casa", description: "Geladeira", external_key: "geladeira" })),
    );
    expect(replay.idempotentReplay).toBe(true);
    expect(replay.transactions).toHaveLength(3);

    await createTransaction(sql, must(parseTransactionCreate({ kind: "transfer", date: "2026-10-12", amount_cents: 20000, account: "itau", to_account: "nubank", description: "Pagamento fatura" })));
    await createTransaction(sql, must(parseTransactionCreate({ kind: "income", date: "2026-10-05", amount_cents: 800000, account: "itau", category: "salario", description: "Salário" })));

    const card = await getAccountView(sql, "nubank", TODAY);
    // Only the first installment is in the past; the payment lowers the debt.
    expect(card.balance_cents).toBe(33334 - 20000);
    expect(card.available_credit_cents).toBe(300000 - 13334);
    expect(card.statement).toMatchObject({ from: "2026-10-06", to: "2026-11-05", due_date: "2026-11-12", total_cents: 33334 });

    const summary = await getFinanceSummary(sql, "2026-10", TODAY);
    expect(summary.income_cents).toBe(800000);
    // vet 20000 + energia 19873 + 21000 + geladeira 33334; the transfer is not an expense.
    expect(summary.expense_cents).toBe(20000 + 19873 + 21000 + 33334);
    expect(summary.result_cents).toBe(800000 - summary.expense_cents);
    expect(summary.net_worth.liabilities_cents).toBe(13334);
    expect(summary.bills_due.map((bill) => bill.slug)).toEqual(["netflix"]);
    expect(summary.expense_by_category[0]).toMatchObject({ slug: "moradia", amount_cents: 40873 });
  });

  test("balance check and reconcile", async () => {
    const view = await getAccountView(sql, "itau", TODAY);
    await addBalanceCheck(sql, "itau", { date: TODAY, balance_cents: view.balance_cents - 100, external_key: "check:1" }, TODAY);
    const off = await reconcileAccount(sql, "itau", TODAY, TODAY);
    expect(off).toMatchObject({ reconciled: false, difference_cents: -100 });
    await addBalanceCheck(sql, "itau", { date: TODAY, balance_cents: view.balance_cents, external_key: "check:2" }, TODAY);
    const ok = await reconcileAccount(sql, "itau", TODAY, TODAY);
    expect(ok.reconciled).toBe(true);
    expect(ok.cleared_count).toBeGreaterThan(0);
    expect((await getAccountView(sql, "itau", TODAY)).last_check?.difference_cents).toBe(0);
  });

  test("budgets: default plus month override, children roll up", async () => {
    await putBudgets(sql, { month: null, items: [{ category: "energia", amount_cents: 25000 }, { category: "pets", amount_cents: 10000 }] }, TODAY);
    const view = await putBudgets(sql, { month: "2026-10", items: [{ category: "pets", amount_cents: 30000 }] }, TODAY);
    expect(view.lines.find((line) => line.slug === "pets")).toMatchObject({ budget_cents: 30000, total_spent_cents: 20000, over: false });
    expect(view.lines.find((line) => line.slug === "energia")).toMatchObject({ budget_cents: 25000, spent_cents: 40873, over: true });
    expect(view.lines.find((line) => line.slug === "moradia")).toMatchObject({ budget_cents: 25000, over: true });
    expect(view.trend.months).toHaveLength(6);
    const november = await getBudgetView(sql, "2026-11");
    expect(november.lines.find((line) => line.slug === "pets")?.budget_cents).toBe(10000);
    await putBudgets(sql, { month: null, items: [{ category: "pets", amount_cents: null }] }, TODAY);
    expect((await getBudgetView(sql, "2026-11")).lines.find((line) => line.slug === "pets")).toBeUndefined();
  });

  test("subcategories inherit the parent's kind and stay two levels deep", async () => {
    const { category } = await createCategory(sql, { slug: "pets_creche", name: "Creche", kind: null, parent: "pets", sort_order: 9 });
    expect(category).toMatchObject({ kind: "expense", parent_slug: "pets" });
    await expect(createCategory(sql, { slug: "neta", name: "x", kind: null, parent: "pets_creche", sort_order: 0 })).rejects.toThrow(/top-level/);
  });

  test("items can repeat every N months", async () => {
    const item = await itemsRepo.insertItem(sql, {
      domain: "finance", dog_id: null, family_member_id: null, vehicle_id: null, area_id: null, area_slug: null,
      title: "IPTU", category: "bill", status: "active", priority: "normal", due_date: "2026-01-31",
      last_done_on: null, interval_days: null, interval_months: 1, notes: null, external_key: null,
    });
    const done = await completeItem(sql, item.id, {
      done_on: "2026-01-31", notes: null, external_key: null, weight_kg: null, odometer_km: null, amount_cents: 12000, provider: null,
    }, TODAY);
    expect(done.item?.due_date).toBe("2026-02-28");
    expect(done.transaction).toMatchObject({ category_slug: "outros", amount_cents: 12000 });
  });
});
