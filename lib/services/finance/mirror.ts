import type { Sql } from "@/lib/db/client";
import { isUniqueViolation } from "@/lib/db/errors";
import { planMirror, type MirrorTarget } from "@/lib/domain/finance/mirror";
import { sectorCategory } from "@/lib/domain/finance/sector-map";
import type { FinAccount, FinBill, FinCategory, FinTransaction } from "@/lib/domain/finance/types";
import type { CareEvent } from "@/lib/domain/types";
import * as repo from "@/lib/repositories/finance";
import { assertCategoryKind, optionalAccountField, requireCategoryField } from "@/lib/services/finance/refs";

export type EventFinance = { category: FinCategory | null; account: FinAccount | null };

/** Resolves finance_category/account sent with an event, before anything is written. */
export async function resolveEventFinance(
  sql: Sql,
  refs: { finance_category?: string | null; account?: string | null },
): Promise<EventFinance> {
  const category = refs.finance_category ? await requireCategoryField(sql, refs.finance_category, "finance_category") : null;
  if (category) assertCategoryKind("expense", category, "finance_category");
  const account = await optionalAccountField(sql, refs.account);
  return { category, account };
}

/**
 * Keeps the event's finance transaction in step with the event: creates it when the
 * event has a cost, follows amount/date/title changes, voids it with the event.
 */
export async function mirrorEvent(
  sql: Sql,
  event: CareEvent,
  options: EventFinance & { bill?: FinBill | null } = { category: null, account: null },
): Promise<FinTransaction | null> {
  const existing = await repo.findTransactionByEvent(sql, event.id);
  const bill = options.bill ?? null;
  let categoryId = options.category?.id ?? bill?.category_id ?? null;
  if (!existing && !categoryId) {
    const mapped = (await repo.getCategoryByRef(sql, sectorCategory(event.domain, event.category))) ??
      (await repo.getCategoryByRef(sql, "outros"));
    categoryId = mapped?.id ?? null;
  }
  if (!existing && !categoryId) return null;

  const target: MirrorTarget = {
    category_id: categoryId ?? "",
    account_id: options.account?.id ?? bill?.account_id ?? null,
    kind: bill?.kind === "income" ? "income" : "expense",
    source: bill ? "bill" : "care_event",
    bill_id: bill?.id ?? null,
  };
  const plan = planMirror(event, existing, target, {
    category_id: options.category?.id,
    account_id: options.account?.id,
  });
  if (plan.type === "none") return existing;
  if (plan.type === "update") return repo.updateTransaction(sql, plan.id, plan.patch);
  try {
    const [created] = await repo.insertTransactions(sql, [plan.write]);
    return created ?? null;
  } catch (error) {
    // Two writers for the same event: the other one won.
    if (isUniqueViolation(error)) return repo.findTransactionByEvent(sql, event.id);
    throw error;
  }
}
