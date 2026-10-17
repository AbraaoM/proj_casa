import { randomUUID } from "node:crypto";
import type { Sql } from "@/lib/db/client";
import { isUniqueViolation } from "@/lib/db/errors";
import { installmentDates, splitInstallments } from "@/lib/domain/finance/recurrence";
import type { FinTransaction } from "@/lib/domain/finance/types";
import type { TransactionInput, TransactionListQuery, TransactionPatch } from "@/lib/domain/finance/validate";
import { notFound, validationError } from "@/lib/errors";
import * as repo from "@/lib/repositories/finance";
import { assertCategoryKind, optionalAccountField, requireAccountField, requireCategoryField } from "@/lib/services/finance/refs";

export async function listTransactions(sql: Sql, query: TransactionListQuery) {
  return repo.listTransactions(sql, query);
}

export async function getTransaction(sql: Sql, id: string): Promise<FinTransaction> {
  const transaction = await repo.getTransaction(sql, id);
  if (!transaction) throw notFound("Transaction was not found.");
  return transaction;
}

/**
 * One transaction, or N monthly installments when `installments` is set (the
 * purchase counts on its own date; the parts follow on the same day of later months).
 * Idempotent by external_key.
 */
export async function createTransaction(
  sql: Sql,
  input: TransactionInput,
): Promise<{ transactions: FinTransaction[]; idempotentReplay: boolean }> {
  if (input.external_key) {
    const existing = await repo.findTransactionByExternalKey(sql, input.external_key);
    if (existing) return { transactions: await withGroup(sql, existing), idempotentReplay: true };
  }

  const account = await optionalAccountField(sql, input.account);
  const toAccount = await optionalAccountField(sql, input.to_account, "to_account");
  if (account && toAccount && account.id === toAccount.id) {
    throw validationError("to_account must differ from account.", [{ field: "to_account", message: "must differ from account" }]);
  }
  let categoryId: string | null = null;
  if (input.kind !== "transfer" && input.category) {
    const category = await requireCategoryField(sql, input.category);
    assertCategoryKind(input.kind, category);
    categoryId = category.id;
  }

  const base = {
    kind: input.kind,
    account_id: account?.id ?? null,
    to_account_id: toAccount?.id ?? null,
    category_id: categoryId,
    description: input.description,
    payee: input.payee,
    notes: input.notes,
    status: input.status,
    source: "manual" as const,
    care_event_id: null,
    bill_id: null,
  };
  const writes: repo.TransactionWrite[] = [];
  if (input.installments) {
    const group = randomUUID();
    const dates = installmentDates(input.date, input.installments);
    const amounts = splitInstallments(input.amount_cents, input.installments);
    dates.forEach((date, index) => {
      writes.push({
        ...base,
        date,
        amount_cents: amounts[index] as number,
        installment_group: group,
        installment_n: index + 1,
        installment_total: input.installments,
        external_key: input.external_key ? (index === 0 ? input.external_key : `${input.external_key}#${index + 1}`) : null,
      });
    });
  } else {
    writes.push({
      ...base,
      date: input.date,
      amount_cents: input.amount_cents,
      installment_group: null,
      installment_n: null,
      installment_total: null,
      external_key: input.external_key,
    });
  }

  try {
    return { transactions: await repo.insertTransactions(sql, writes), idempotentReplay: false };
  } catch (error) {
    if (input.external_key && isUniqueViolation(error)) {
      const raced = await repo.findTransactionByExternalKey(sql, input.external_key);
      if (raced) return { transactions: await withGroup(sql, raced), idempotentReplay: true };
    }
    throw error;
  }
}

async function withGroup(sql: Sql, transaction: FinTransaction): Promise<FinTransaction[]> {
  return transaction.installment_group ? repo.listInstallmentGroup(sql, transaction.installment_group) : [transaction];
}

/**
 * Corrects a transaction. One that mirrors a care event takes its amount, date and
 * voiding from the event, so those changes go through PATCH /events/:id instead.
 */
export async function updateTransaction(sql: Sql, id: string, patch: TransactionPatch): Promise<FinTransaction> {
  const current = await getTransaction(sql, id);
  if (current.care_event_id) {
    const blocked = (["amount_cents", "date", "voided"] as const).filter((field) => patch[field] !== undefined);
    if (blocked.length > 0) {
      throw validationError(
        `This transaction mirrors a care event. Change ${blocked.join(", ")} with PATCH /api/agent/events/${current.care_event_id}.`,
        blocked.map((field) => ({ field, message: `follows care event ${current.care_event_id}` })),
      );
    }
  }

  const update: repo.TransactionUpdate = {
    date: patch.date,
    amount_cents: patch.amount_cents,
    description: patch.description,
    payee: patch.payee,
    notes: patch.notes,
    status: patch.status,
    voided: patch.voided,
  };

  if (current.kind === "transfer") {
    if (patch.category !== undefined) {
      throw validationError("A transfer has no category.", [{ field: "category", message: "must be empty for a transfer" }]);
    }
    for (const field of ["account", "to_account"] as const) {
      if (patch[field] === null) throw validationError(`${field} is required for a transfer.`, [{ field, message: "is required for a transfer" }]);
    }
    if (patch.account) update.account_id = (await requireAccountField(sql, patch.account)).id;
    if (patch.to_account) update.to_account_id = (await requireAccountField(sql, patch.to_account, "to_account")).id;
    const from = update.account_id ?? current.account_id;
    const to = update.to_account_id ?? current.to_account_id;
    if (from === to) throw validationError("to_account must differ from account.", [{ field: "to_account", message: "must differ from account" }]);
  } else {
    if (patch.to_account) {
      throw validationError("to_account is only allowed for a transfer.", [{ field: "to_account", message: "is only allowed for a transfer" }]);
    }
    if (patch.account !== undefined) update.account_id = patch.account ? (await requireAccountField(sql, patch.account)).id : null;
    if (patch.category) {
      const category = await requireCategoryField(sql, patch.category);
      assertCategoryKind(current.kind, category);
      update.category_id = category.id;
    }
  }

  const transaction = await repo.updateTransaction(sql, current.id, update);
  if (!transaction) throw notFound("Transaction was not found.");
  return transaction;
}
