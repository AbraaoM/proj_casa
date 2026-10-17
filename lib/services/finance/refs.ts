import type { Sql } from "@/lib/db/client";
import type { FinAccount, FinCategory } from "@/lib/domain/finance/types";
import { validationError } from "@/lib/errors";
import { getAccountByRef, getCategoryByRef } from "@/lib/repositories/finance";

/** An account named in a payload: must exist and not be archived. */
export async function requireAccountField(sql: Sql, ref: string, field = "account"): Promise<FinAccount> {
  const account = await getAccountByRef(sql, ref);
  if (!account) throw validationError(`${field} was not found.`, [{ field, message: "was not found" }]);
  if (account.archived_at) throw validationError(`${field} is archived.`, [{ field, message: "is archived" }]);
  return account;
}

export async function optionalAccountField(sql: Sql, ref: string | null | undefined, field = "account") {
  return ref ? requireAccountField(sql, ref, field) : null;
}

/** A category named in a payload: must exist and not be archived. */
export async function requireCategoryField(sql: Sql, ref: string, field = "category"): Promise<FinCategory> {
  const category = await getCategoryByRef(sql, ref);
  if (!category) throw validationError(`${field} was not found.`, [{ field, message: "was not found" }]);
  if (category.archived_at) throw validationError(`${field} is archived.`, [{ field, message: "is archived" }]);
  return category;
}

/** Expenses need an expense category. Income may land on an expense category: that is a refund. */
export function assertCategoryKind(kind: "expense" | "income", category: FinCategory, field = "category") {
  if (kind === "expense" && category.kind !== "expense") {
    throw validationError(`${field} is an income category.`, [{ field, message: "must be an expense category" }]);
  }
}
