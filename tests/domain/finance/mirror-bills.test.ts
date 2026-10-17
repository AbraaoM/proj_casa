import { describe, expect, test } from "vitest";
import { itemStatusForBill, planBillPayment } from "@/lib/domain/finance/bills";
import { planMirror, type MirrorTarget } from "@/lib/domain/finance/mirror";
import type { FinTransaction } from "@/lib/domain/finance/types";
import type { CareEvent } from "@/lib/domain/types";

const event = (over: Partial<CareEvent> = {}): CareEvent => ({
  id: "ev1", care_item_id: null, domain: "dog", dog_id: "d1", family_member_id: null, vehicle_id: null,
  area_id: null, area_slug: null, subject_name: "Thor", category: "vet", title: "Consulta", done_on: "2026-10-10", done_at: null,
  notes: null, provider: "Clínica", weight_kg: null, odometer_km: null, amount_cents: 18000, voided_at: null,
  created_by_agent: true, external_key: null, created_at: "", updated_at: "", ...over,
});
const target: MirrorTarget = { category_id: "cat-pets", account_id: null, kind: "expense", source: "care_event", bill_id: null };
const tx = (over: Partial<FinTransaction> = {}) =>
  ({ id: "tx1", amount_cents: 18000, date: "2026-10-10", description: "Consulta", category_id: "cat-pets", account_id: null, voided_at: null, ...over }) as FinTransaction;

describe("planMirror", () => {
  test("an event with a cost creates an expense", () => {
    const plan = planMirror(event(), null, target);
    expect(plan.type).toBe("insert");
    if (plan.type === "insert") {
      expect(plan.write).toMatchObject({ kind: "expense", amount_cents: 18000, date: "2026-10-10", care_event_id: "ev1", payee: "Clínica", source: "care_event" });
    }
  });
  test("no cost, zero or voided: nothing to create", () => {
    expect(planMirror(event({ amount_cents: null }), null, target).type).toBe("none");
    expect(planMirror(event({ amount_cents: 0 }), null, target).type).toBe("none");
    expect(planMirror(event({ voided_at: "x" }), null, target).type).toBe("none");
  });
  test("amount and date follow the event; category edited on the transaction stays", () => {
    const plan = planMirror(event({ amount_cents: 20000, done_on: "2026-10-11" }), tx({ category_id: "cat-other" }), target);
    expect(plan).toEqual({ type: "update", id: "tx1", patch: { amount_cents: 20000, date: "2026-10-11" } });
  });
  test("voided event or removed amount voids; live again un-voids", () => {
    expect(planMirror(event({ voided_at: "x" }), tx(), target)).toEqual({ type: "update", id: "tx1", patch: { voided: true } });
    expect(planMirror(event({ amount_cents: null }), tx(), target)).toEqual({ type: "update", id: "tx1", patch: { voided: true } });
    expect(planMirror(event({ amount_cents: null }), tx({ voided_at: "x" }), target).type).toBe("none");
    expect(planMirror(event(), tx({ voided_at: "x" }), target)).toEqual({ type: "update", id: "tx1", patch: { voided: false } });
  });
  test("explicit overrides apply to an existing transaction", () => {
    expect(planMirror(event(), tx(), target, { account_id: "acc" })).toEqual({ type: "update", id: "tx1", patch: { account_id: "acc" } });
    expect(planMirror(event(), tx(), target).type).toBe("none");
  });
});

describe("bill payment", () => {
  const bill = {
    status: "active" as const, amount_cents: 15000, frequency: "monthly" as const, interval: 1, day_of_month: 10,
    next_due_date: "2026-10-10", remaining: null, end_date: null,
  };
  test("moves bill and item to the next due date", () => {
    const plan = planBillPayment(bill, { paid_on: "2026-10-09", amount_cents: null }, "2026-10-16");
    expect(plan).toMatchObject({
      paid_on: "2026-10-09", amount_cents: 15000, settles: "2026-10-10",
      bill: { next_due_date: "2026-11-10", status: "active" },
      item: { due_date: "2026-11-10", status: "active", last_done_on: "2026-10-09" },
    });
  });
  test("a varying amount is taken from the payment", () => {
    expect(planBillPayment(bill, { paid_on: null, amount_cents: 17321 }, "2026-10-16").amount_cents).toBe(17321);
  });
  test("last installment completes the item", () => {
    const plan = planBillPayment({ ...bill, remaining: 1 }, { paid_on: null, amount_cents: null }, "2026-10-16");
    expect(plan.bill.status).toBe("ended");
    expect(plan.item.status).toBe("completed");
  });
  test("refuses suggested bills and future dates", () => {
    expect(() => planBillPayment({ ...bill, status: "suggested" }, { paid_on: null, amount_cents: null }, "2026-10-16")).toThrow(/suggested/);
    expect(() => planBillPayment(bill, { paid_on: "2026-10-17", amount_cents: null }, "2026-10-16")).toThrow(/future/);
  });
  test("item status follows the bill", () => {
    expect(itemStatusForBill("suggested")).toBe("paused");
    expect(itemStatusForBill("ended")).toBe("completed");
  });
});
