import type { Sql } from "@/lib/db/client";
import { isUniqueViolation } from "@/lib/db/errors";
import { itemStatusForBill, planBillPayment } from "@/lib/domain/finance/bills";
import { retreatBill } from "@/lib/domain/finance/recurrence";
import type { FinBill, FinCategory, FinTransaction } from "@/lib/domain/finance/types";
import type { BillInput, BillPatch, PayInput } from "@/lib/domain/finance/validate";
import type { CareEvent, CareItem } from "@/lib/domain/types";
import { notFound, validationError } from "@/lib/errors";
import * as repo from "@/lib/repositories/finance";
import * as eventsRepo from "@/lib/repositories/events";
import * as itemsRepo from "@/lib/repositories/items";
import { mirrorEvent } from "@/lib/services/finance/mirror";
import { optionalAccountField, requireCategoryField } from "@/lib/services/finance/refs";

export type BillView = FinBill & { payments: FinTransaction[] };

export async function listBills(sql: Sql, statuses: FinBill["status"][] | null = null): Promise<FinBill[]> {
  return repo.listBills(sql, statuses);
}

export async function getBill(sql: Sql, ref: string): Promise<FinBill> {
  const bill = await repo.getBillByRef(sql, ref);
  if (!bill) throw notFound("Bill was not found.");
  return bill;
}

export async function getBillView(sql: Sql, ref: string, limit = 12): Promise<BillView> {
  const bill = await getBill(sql, ref);
  const { transactions } = await repo.listTransactions(sql, {
    from: null, to: null, account: null, category: null, kind: null, status: null, source: null,
    bill: bill.id, origin: null, q: null, include_voided: false, limit, offset: 0,
  });
  return { ...bill, payments: transactions };
}

function categoryFits(kind: FinBill["kind"], category: FinCategory, field = "category") {
  const wanted = kind === "income" ? "income" : "expense";
  if (category.kind !== wanted) {
    throw validationError(`${field} must be an ${wanted} category for a ${kind} bill.`, [
      { field, message: `must be an ${wanted} category` },
    ]);
  }
}

/**
 * A recurring bill (or income). It gets a finance pending item so it shows on the
 * dashboard like any other reminder; `care_item_id` adopts an existing one instead.
 * Idempotent by slug and by external_key.
 */
export async function createBill(sql: Sql, input: BillInput): Promise<{ bill: FinBill; idempotentReplay: boolean }> {
  const existing =
    (input.external_key ? await repo.findBillByExternalKey(sql, input.external_key) : null) ??
    (await repo.getBillByRef(sql, input.slug));
  if (existing) return { bill: existing, idempotentReplay: true };

  const category = await requireCategoryField(sql, input.category);
  categoryFits(input.kind, category);
  const account = await optionalAccountField(sql, input.account);

  let item: CareItem;
  if (input.care_item_id) {
    const adopted = await itemsRepo.getItem(sql, input.care_item_id);
    if (!adopted) throw validationError("care_item_id was not found.", [{ field: "care_item_id", message: "was not found" }]);
    if (adopted.domain !== "finance") {
      throw validationError("care_item_id must be a finance item.", [{ field: "care_item_id", message: "must be a finance item" }]);
    }
    if (await repo.findBillByItem(sql, adopted.id)) {
      throw validationError("care_item_id already belongs to a bill.", [{ field: "care_item_id", message: "already belongs to a bill" }]);
    }
    item = (await itemsRepo.updateItem(sql, adopted.id, {
      due_date: input.next_due_date,
      status: itemStatusForBill(input.status),
      interval_days: null,
      interval_months: null,
    })) as CareItem;
  } else {
    item = await itemsRepo.insertItem(sql, {
      domain: "finance", dog_id: null, family_member_id: null, vehicle_id: null, area_id: null, area_slug: null,
      title: input.name, category: "bill", status: itemStatusForBill(input.status), priority: "normal",
      due_date: input.next_due_date, last_done_on: null, interval_days: null, interval_months: null,
      notes: null, external_key: `bill:${input.slug}`,
    });
  }

  try {
    const bill = await repo.insertBill(sql, {
      slug: input.slug, name: input.name, kind: input.kind, amount_cents: input.amount_cents,
      amount_varies: input.amount_varies, category_id: category.id, account_id: account?.id ?? null,
      frequency: input.frequency, interval: input.interval, day_of_month: input.day_of_month,
      next_due_date: input.next_due_date, end_date: input.end_date, remaining: input.remaining,
      autopay: input.autopay, status: input.status, care_item_id: item.id, notes: input.notes,
      external_key: input.external_key,
    });
    return { bill, idempotentReplay: false };
  } catch (error) {
    if (isUniqueViolation(error)) {
      const raced = await repo.getBillByRef(sql, input.slug);
      if (raced) return { bill: raced, idempotentReplay: true };
    }
    throw error;
  }
}

/** Also how a suggestion is confirmed (status active) or dismissed (status ended). */
export async function updateBill(sql: Sql, ref: string, patch: BillPatch): Promise<FinBill> {
  const current = await getBill(sql, ref);
  const kind = patch.kind ?? current.kind;
  const update: Parameters<typeof repo.updateBill>[2] = {
    name: patch.name, kind: patch.kind, amount_cents: patch.amount_cents, amount_varies: patch.amount_varies,
    frequency: patch.frequency, interval: patch.interval, day_of_month: patch.day_of_month,
    next_due_date: patch.next_due_date, end_date: patch.end_date, remaining: patch.remaining,
    autopay: patch.autopay, status: patch.status, notes: patch.notes,
  };
  if (patch.category || patch.kind) {
    const category = patch.category ? await requireCategoryField(sql, patch.category) : await requireCategoryField(sql, current.category_id);
    categoryFits(kind, category);
    update.category_id = category.id;
  }
  if (patch.account !== undefined) update.account_id = (await optionalAccountField(sql, patch.account))?.id ?? null;

  const frequency = patch.frequency ?? current.frequency;
  if (frequency === "weekly" || frequency === "every_n_days") update.day_of_month = null;
  else if (patch.day_of_month === undefined && patch.next_due_date) update.day_of_month = Number(patch.next_due_date.slice(8, 10));
  else if (patch.day_of_month === null) update.day_of_month = Number((patch.next_due_date ?? current.next_due_date).slice(8, 10));

  const bill = (await repo.updateBill(sql, current.id, update)) as FinBill;
  await syncItem(sql, bill);
  return bill;
}

/** The bill's reminder mirrors its name, next due date and status. */
async function syncItem(sql: Sql, bill: FinBill): Promise<CareItem> {
  const item = bill.care_item_id ? await itemsRepo.getItem(sql, bill.care_item_id) : null;
  if (!item) {
    const created = await itemsRepo.insertItem(sql, {
      domain: "finance", dog_id: null, family_member_id: null, vehicle_id: null, area_id: null, area_slug: null,
      title: bill.name, category: "bill", status: itemStatusForBill(bill.status), priority: "normal",
      due_date: bill.next_due_date, last_done_on: null, interval_days: null, interval_months: null,
      notes: null, external_key: null,
    });
    await repo.updateBill(sql, bill.id, { care_item_id: created.id });
    return created;
  }
  return (await itemsRepo.updateItem(sql, item.id, {
    title: bill.name,
    due_date: bill.next_due_date,
    status: itemStatusForBill(bill.status),
  })) as CareItem;
}

export type PayResult = {
  bill: FinBill;
  item: CareItem;
  event: CareEvent;
  transaction: FinTransaction | null;
  idempotentReplay: boolean;
};

/**
 * Pays the bill's current due date: records the event on its item (with the
 * amount), writes the finance transaction, and moves bill and item to the next date.
 * Idempotent by external_key.
 */
export async function payBill(sql: Sql, ref: string, input: PayInput, today: string): Promise<PayResult> {
  let bill = await getBill(sql, ref);
  if (input.external_key) {
    const existing = await itemsRepo.findEventByExternalKey(sql, input.external_key);
    if (existing) {
      if (!bill.care_item_id || existing.care_item_id !== bill.care_item_id) {
        throw validationError("external_key already belongs to another record.", [
          { field: "external_key", message: "already belongs to another record" },
        ]);
      }
      const item = (await itemsRepo.getItem(sql, bill.care_item_id)) as CareItem;
      return { bill, item, event: existing, transaction: await repo.findTransactionByEvent(sql, existing.id), idempotentReplay: true };
    }
  }

  const plan = planBillPayment(bill, input, today);
  const account = await optionalAccountField(sql, input.account);
  if (!bill.care_item_id || !(await itemsRepo.getItem(sql, bill.care_item_id))) {
    await syncItem(sql, bill);
    bill = await getBill(sql, bill.id);
  }

  let written: { item: CareItem; event: CareEvent };
  try {
    written = await itemsRepo.writeDone(sql, {
      item_id: bill.care_item_id as string,
      done_on: plan.paid_on,
      notes: input.notes,
      weight_kg: null,
      odometer_km: null,
      amount_cents: plan.amount_cents,
      provider: null,
      external_key: input.external_key,
      advance: true,
      last_done_on: plan.item.last_done_on,
      due_date: plan.item.due_date,
      status: plan.item.status,
      update_weight: false,
      update_odometer: false,
    });
  } catch (error) {
    if (input.external_key && isUniqueViolation(error)) return payBill(sql, ref, input, today);
    throw error;
  }

  const transaction = await mirrorEvent(sql, written.event, { category: null, account, bill });
  bill = (await repo.updateBill(sql, bill.id, plan.bill)) as FinBill;
  return { bill, item: written.item, event: written.event, transaction, idempotentReplay: false };
}

/**
 * A payment was voided. When it was the bill's newest live payment, the bill goes
 * back to the due date it had settled (installment returned, ended → active) and the
 * reminder follows. An older payment leaves the dates alone. Returns a note for the caller.
 */
export async function unpayBill(sql: Sql, bill: FinBill, voided: CareEvent): Promise<string> {
  const itemId = voided.care_item_id as string;
  const newer = await eventsRepo.latestLiveItemEvent(sql, itemId, voided.id);
  const isNewer =
    newer !== null && (newer.done_on > voided.done_on || (newer.done_on === voided.done_on && newer.created_at > voided.created_at));
  if (isNewer) return "A newer payment of this bill is still live, so its due date was not moved.";
  const back = retreatBill(bill);
  const updated = (await repo.updateBill(sql, bill.id, back)) as FinBill;
  await syncItem(sql, updated);
  await itemsRepo.updateItem(sql, itemId, { last_done_on: newer?.done_on ?? null });
  return `The bill moved back to its due date ${back.next_due_date}.`;
}
