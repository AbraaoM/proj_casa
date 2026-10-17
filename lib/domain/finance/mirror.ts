import type { FinTransaction, TransactionKind, TransactionSource } from "@/lib/domain/finance/types";
import type { CareEvent } from "@/lib/domain/types";
import type { TransactionUpdate, TransactionWrite } from "@/lib/repositories/finance";

export type MirrorTarget = {
  category_id: string;
  account_id: string | null;
  kind: Exclude<TransactionKind, "transfer">;
  source: Exclude<TransactionSource, "manual">;
  bill_id: string | null;
};

export type MirrorPlan =
  | { type: "none" }
  | { type: "insert"; write: TransactionWrite }
  | { type: "update"; id: string; patch: TransactionUpdate };

/** An event's cost lives in finance while the event is live and has a positive amount. */
export function eventHasCost(event: Pick<CareEvent, "amount_cents" | "voided_at">): boolean {
  return event.voided_at === null && event.amount_cents !== null && event.amount_cents > 0;
}

/**
 * What to do with the finance transaction mirroring a care event.
 * `target` is the category/account to use when creating, and explicit overrides
 * (`override`) are applied to an existing transaction too. Amount, date and title
 * always follow the event; category and account changed on the transaction stay.
 */
export function planMirror(
  event: CareEvent,
  existing: FinTransaction | null,
  target: MirrorTarget,
  override: { category_id?: string; account_id?: string } = {},
): MirrorPlan {
  const live = eventHasCost(event);
  if (!existing) {
    if (!live) return { type: "none" };
    return {
      type: "insert",
      write: {
        kind: target.kind,
        date: event.done_on,
        amount_cents: event.amount_cents as number,
        account_id: override.account_id ?? target.account_id,
        to_account_id: null,
        category_id: override.category_id ?? target.category_id,
        description: event.title,
        payee: event.provider,
        notes: null,
        status: "pending",
        source: target.source,
        care_event_id: event.id,
        bill_id: target.bill_id,
        installment_group: null,
        installment_n: null,
        installment_total: null,
        external_key: null,
      },
    };
  }

  if (!live) {
    return existing.voided_at === null ? { type: "update", id: existing.id, patch: { voided: true } } : { type: "none" };
  }

  const patch: TransactionUpdate = {};
  if (existing.voided_at !== null) patch.voided = false;
  if (existing.amount_cents !== event.amount_cents) patch.amount_cents = event.amount_cents as number;
  if (existing.date !== event.done_on) patch.date = event.done_on;
  if (existing.description !== event.title) patch.description = event.title;
  if (override.category_id && override.category_id !== existing.category_id) patch.category_id = override.category_id;
  if (override.account_id && override.account_id !== existing.account_id) patch.account_id = override.account_id;
  return Object.keys(patch).length > 0 ? { type: "update", id: existing.id, patch } : { type: "none" };
}
