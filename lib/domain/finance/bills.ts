import { advanceBill } from "@/lib/domain/finance/recurrence";
import type { BillStatus, FinBill } from "@/lib/domain/finance/types";
import type { ItemStatus } from "@/lib/domain/types";
import { validationError } from "@/lib/errors";

/** The pending item that reminds about a bill follows the bill's status. */
export function itemStatusForBill(status: BillStatus): ItemStatus {
  if (status === "active") return "active";
  if (status === "ended") return "completed";
  return "paused";
}

export type BillPaymentPlan = {
  paid_on: string;
  amount_cents: number;
  /** The due date this payment settles. */
  settles: string;
  bill: { next_due_date: string; remaining: number | null; status: BillStatus };
  item: { last_done_on: string; due_date: string; status: ItemStatus };
};

/** Paying settles the current due date and moves the bill (and its item) to the next one. */
export function planBillPayment(
  bill: Pick<FinBill, "status" | "amount_cents" | "frequency" | "interval" | "day_of_month" | "next_due_date" | "remaining" | "end_date">,
  input: { paid_on: string | null; amount_cents: number | null },
  today: string,
): BillPaymentPlan {
  if (bill.status !== "active") {
    throw validationError(`A ${bill.status} bill cannot be paid. PATCH status to active first.`, [
      { field: "status", message: `bill is ${bill.status}` },
    ]);
  }
  const paidOn = input.paid_on ?? today;
  if (paidOn > today) {
    throw validationError("paid_on cannot be in the future.", [{ field: "paid_on", message: "cannot be in the future" }]);
  }
  const next = advanceBill(bill);
  return {
    paid_on: paidOn,
    amount_cents: input.amount_cents ?? bill.amount_cents,
    settles: bill.next_due_date,
    bill: next,
    item: { last_done_on: paidOn, due_date: next.next_due_date, status: itemStatusForBill(next.status) },
  };
}
