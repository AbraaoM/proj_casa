/**
 * The panel's one-tap actions on a real Postgres: idempotent, undoable by voiding,
 * and a new tap after an undo records again. Skipped unless TEST_DATABASE_URL is set.
 *
 *   TEST_DATABASE_URL=postgresql://casa:casa@localhost:5432/casa_test npx vitest run tests/integration/one-tap-db.test.ts
 */
import { beforeAll, describe, expect, test } from "vitest";
import { createSql, type Sql } from "@/lib/db/client";
import { applyMigrations } from "@/lib/db/migrate";
import { parseDogCreate } from "@/lib/domain/entities";
import { parseBillCreate } from "@/lib/domain/finance/validate";
import { parseCreateItem } from "@/lib/domain/validate";
import type { Clock } from "@/lib/domain/types";
import { getItem } from "@/lib/repositories/items";
import { updateEvent } from "@/lib/services/events";
import { createBill, getBill, payBill } from "@/lib/services/finance/bills";
import { createItem } from "@/lib/services/items";
import { tapDone, tapDose, tapPay, tapShift, undoTap } from "@/lib/services/one-tap";
import { createDog } from "@/lib/services/subjects";

const url = process.env.TEST_DATABASE_URL;
const TODAY = "2026-10-17";

function must<T>(result: { ok: true; value: T } | { ok: false; details: unknown }): T {
  if (!result.ok) throw new Error(JSON.stringify(result.details));
  return result.value;
}

function ok<T extends { ok: boolean }>(result: T): Extract<T, { ok: true }> {
  if (!result.ok) throw new Error(JSON.stringify(result));
  return result as Extract<T, { ok: true }>;
}

describe.skipIf(!url)("one-tap actions", () => {
  let sql: Sql;
  let dogId: string;

  async function count(query: string, params: unknown[]): Promise<number> {
    const rows = await sql.query<{ n: number }>(query, params);
    return rows[0]!.n;
  }
  const liveTx = (billId: string) =>
    count("SELECT count(*)::int AS n FROM fin_transactions WHERE bill_id = $1 AND voided_at IS NULL", [billId]);
  const liveEvents = (itemId: string) =>
    count("SELECT count(*)::int AS n FROM care_events WHERE care_item_id = $1 AND voided_at IS NULL", [itemId]);

  async function dogItem(title: string, due: string, extra: Record<string, unknown> = {}) {
    const { item } = await createItem(sql, must(parseCreateItem({ domain: "dog", dog_id: dogId, title, category: "deworming", due_date: due, ...extra })));
    return item;
  }

  beforeAll(async () => {
    if (!url || !/test/.test(url)) throw new Error("TEST_DATABASE_URL must name a test database.");
    process.env.DATABASE_DRIVER = "pg";
    sql = createSql(url);
    await sql.query("DROP SCHEMA IF EXISTS public CASCADE");
    await sql.query("CREATE SCHEMA public");
    await applyMigrations(sql);
    dogId = (await createDog(sql, must(parseDogCreate({ name: "Thor" })))).id;
  });

  test("Paguei twice pays once; a stale due date does not pay", async () => {
    const { bill } = await createBill(sql, must(parseBillCreate({ slug: "telefone", name: "Telefone", amount_cents: 4990, category: "internet", next_due_date: TODAY })));
    expect(ok(await tapPay(sql, bill.id, TODAY, TODAY)).replay).toBe(false);
    expect(ok(await tapPay(sql, bill.id, TODAY, TODAY)).replay).toBe(true);
    expect(await liveTx(bill.id)).toBe(1);
    expect((await getBill(sql, bill.id)).next_due_date).toBe("2026-11-17");
    expect((await tapPay(sql, bill.id, "2026-09-17", TODAY)).ok).toBe(false);
    expect(await liveTx(bill.id)).toBe(1);
  });

  test("a variable bill is paid with the expected amount (no field)", async () => {
    const { bill } = await createBill(sql, must(parseBillCreate({ slug: "energia", name: "Energia", amount_cents: 21000, amount_varies: true, category: "energia", next_due_date: "2026-10-20" })));
    ok(await tapPay(sql, bill.id, "2026-10-20", TODAY));
    const rows = await sql.query<{ amount_cents: number }>("SELECT amount_cents::int AS amount_cents FROM fin_transactions WHERE bill_id = $1", [bill.id]);
    expect(rows.map((row) => row.amount_cents)).toEqual([21000]);
  });

  test("undoing Paguei voids the payment, gives the due date back, and a new tap pays again", async () => {
    const { bill } = await createBill(sql, must(parseBillCreate({ slug: "escola", name: "Escola", amount_cents: 95000, category: "educacao", next_due_date: "2026-10-20" })));
    const paid = ok(await tapPay(sql, bill.id, "2026-10-20", TODAY));
    expect(ok(await undoTap(sql, paid.undo, TODAY)).replay).toBe(false);
    expect(ok(await undoTap(sql, paid.undo, TODAY)).replay).toBe(true);
    const back = await getBill(sql, bill.id);
    expect(back.next_due_date).toBe("2026-10-20");
    expect((await getItem(sql, back.care_item_id as string))?.due_date).toBe("2026-10-20");
    expect(await liveTx(bill.id)).toBe(0);
    expect(await count("SELECT count(*)::int AS n FROM fin_transactions WHERE bill_id = $1", [bill.id])).toBe(1); // voided, kept

    const again = ok(await tapPay(sql, bill.id, "2026-10-20", TODAY));
    expect(again.replay).toBe(false);
    expect(again.undo).not.toEqual(paid.undo);
    expect(await liveTx(bill.id)).toBe(1);
    expect((await getBill(sql, bill.id)).next_due_date).toBe("2026-11-20");
  });

  test("gap 1 for the agent too: voiding the newest payment moves the bill back, an older one does not", async () => {
    const { bill } = await createBill(sql, must(parseBillCreate({ slug: "parcela", name: "Parcela", amount_cents: 10000, category: "moradia", next_due_date: "2026-09-10", remaining: 2 })));
    const first = await payBill(sql, bill.id, { paid_on: "2026-09-10", amount_cents: null, account: null, notes: null, external_key: "agent:p1" }, TODAY);
    const second = await payBill(sql, bill.id, { paid_on: "2026-10-10", amount_cents: null, account: null, notes: null, external_key: "agent:p2" }, TODAY);
    expect(second.bill.status).toBe("ended");
    const older = await updateEvent(sql, first.event.id, { voided: true }, TODAY);
    expect(older.notes.join(" ")).toMatch(/not moved/);
    expect((await getBill(sql, bill.id)).next_due_date).toBe("2026-11-10");
    const newest = await updateEvent(sql, second.event.id, { voided: true }, TODAY);
    expect(newest.notes.join(" ")).toMatch(/moved back/);
    const back = await getBill(sql, bill.id);
    expect([back.next_due_date, back.remaining, back.status]).toEqual(["2026-10-10", 1, "active"]);
    expect((await getItem(sql, back.care_item_id as string))?.status).toBe("active");
  });

  test("gap 2 for the agent too: the same external_key after a void records something new", async () => {
    const item = await dogItem("Banho", "2026-10-17");
    const { completeItem } = await import("@/lib/services/events");
    const input = { done_on: null, notes: null, external_key: "agent:banho", weight_kg: null, odometer_km: null, amount_cents: null, provider: null };
    const first = await completeItem(sql, item.id, input, TODAY);
    await updateEvent(sql, first.event.id, { voided: true }, TODAY);
    const second = await completeItem(sql, item.id, input, TODAY);
    expect(second.idempotentReplay).toBe(false);
    expect(second.event.id).not.toBe(first.event.id);
    expect((await completeItem(sql, item.id, input, TODAY)).idempotentReplay).toBe(true);
  });

  test("Feito twice records once; undo restores the due date; a new tap records again", async () => {
    const item = await dogItem("Vermífugo", "2026-10-15", { interval_days: 90 });
    const done = ok(await tapDone(sql, item.id, "2026-10-15", TODAY));
    expect(ok(await tapDone(sql, item.id, "2026-10-15", TODAY)).replay).toBe(true);
    expect(await liveEvents(item.id)).toBe(1);
    expect((await getItem(sql, item.id))?.due_date).toBe("2027-01-15");

    ok(await undoTap(sql, done.undo, TODAY));
    const restored = await getItem(sql, item.id);
    expect([restored?.due_date, restored?.last_done_on, restored?.status]).toEqual(["2026-10-15", null, "active"]);
    expect(await liveEvents(item.id)).toBe(0);

    expect(ok(await tapDone(sql, item.id, "2026-10-15", TODAY)).replay).toBe(false);
    expect(await liveEvents(item.id)).toBe(1);
  });

  test("Feito on a one-off item completes it; undo makes it active again", async () => {
    const item = await dogItem("Consulta", "2026-10-17");
    const done = ok(await tapDone(sql, item.id, "2026-10-17", TODAY));
    expect((await getItem(sql, item.id))?.status).toBe("completed");
    ok(await undoTap(sql, done.undo, TODAY));
    expect((await getItem(sql, item.id))?.status).toBe("active");
  });

  test("+1 dia and Ignorar are idempotent, refuse a stale date and undo back", async () => {
    const item = await dogItem("Escovar", "2026-10-17", { interval_days: 7 });
    const snooze = ok(await tapShift(sql, item.id, "snooze", "2026-10-17"));
    expect(ok(await tapShift(sql, item.id, "snooze", "2026-10-17")).replay).toBe(true);
    expect((await getItem(sql, item.id))?.due_date).toBe("2026-10-18");
    ok(await undoTap(sql, snooze.undo, TODAY));
    expect((await getItem(sql, item.id))?.due_date).toBe("2026-10-17");

    const skip = ok(await tapShift(sql, item.id, "skip", "2026-10-17"));
    expect((await getItem(sql, item.id))?.due_date).toBe("2026-10-24");
    expect(await liveEvents(item.id)).toBe(0); // skipping records nothing
    expect((await tapShift(sql, item.id, "snooze", "2026-10-17")).ok).toBe(false); // the screen is stale
    ok(await undoTap(sql, skip.undo, TODAY));
    expect((await getItem(sql, item.id))?.due_date).toBe("2026-10-17");
  });

  test("Dose dada twice records one dose; undo recomputes; a new tap records again", async () => {
    const item = await dogItem("Antibiótico", "2026-10-17", { interval_hours: 12, category: "medicine" });
    const clock: Clock = { now: "2026-10-17T11:00:00.000Z", timeZone: "America/Sao_Paulo" };
    const shown = item.next_due_at;
    const dose = ok(await tapDose(sql, item.id, shown, clock));
    expect(ok(await tapDose(sql, item.id, shown, clock)).replay).toBe(true);
    expect(await liveEvents(item.id)).toBe(1);
    expect((await getItem(sql, item.id))?.next_due_at).toBe("2026-10-17T23:00:00.000Z");

    ok(await undoTap(sql, dose.undo, TODAY));
    expect(await liveEvents(item.id)).toBe(0);
    expect((await getItem(sql, item.id))?.last_done_at).toBeNull();

    expect(ok(await tapDose(sql, item.id, shown, clock)).replay).toBe(false);
    expect(await liveEvents(item.id)).toBe(1);
  });

  test("undo only touches screen taps, and not after the grace period", async () => {
    const item = await dogItem("Vacina", "2026-10-17");
    const { completeItem } = await import("@/lib/services/events");
    const agent = await completeItem(sql, item.id, { done_on: null, notes: null, external_key: "agent:vacina", weight_kg: null, odometer_km: null, amount_cents: null, provider: null }, TODAY);
    expect((await undoTap(sql, { kind: "event", id: agent.event.id }, TODAY)).ok).toBe(false);

    const other = await dogItem("Vacina 2", "2026-10-17");
    const done = ok(await tapDone(sql, other.id, "2026-10-17", TODAY));
    const later = new Date(Date.now() + 10 * 60 * 1000);
    expect((await undoTap(sql, done.undo, TODAY, later)).ok).toBe(false);
    expect(await liveEvents(other.id)).toBe(1);
  });
});
