import type { Sql } from "@/lib/db/client";
import { isUniqueViolation } from "@/lib/db/errors";
import { accountBalance, cardCycle } from "@/lib/domain/finance/money";
import type { BalanceCheck, FinAccount } from "@/lib/domain/finance/types";
import { cardFieldErrors, type AccountInput, type AccountPatch, type BalanceCheckInput } from "@/lib/domain/finance/validate";
import { notFound, validationError } from "@/lib/errors";
import * as repo from "@/lib/repositories/finance";

export type AccountView = FinAccount & {
  /** Today's balance. For a card or loan: what is owed. */
  balance_cents: number;
  available_credit_cents: number | null;
  last_check: (BalanceCheck & { calculated_cents: number; difference_cents: number }) | null;
  /** Credit cards with statement_close_day: the open statement. */
  statement: { from: string; to: string; due_date: string | null; total_cents: number } | null;
};

export async function listAccountViews(sql: Sql, today: string, includeArchived = false): Promise<AccountView[]> {
  const [accounts, totals, checks] = await Promise.all([
    repo.listAccounts(sql, includeArchived),
    repo.accountTotals(sql, today),
    repo.lastBalanceChecks(sql),
  ]);
  return Promise.all(accounts.map((account) => buildView(sql, account, totals, checks.get(account.id) ?? null, today)));
}

export async function getAccountView(sql: Sql, ref: string, today: string): Promise<AccountView> {
  const account = await repo.getAccountByRef(sql, ref);
  if (!account) throw notFound("Account was not found.");
  const [totals, checks] = await Promise.all([repo.accountTotals(sql, today), repo.lastBalanceChecks(sql)]);
  return buildView(sql, account, totals, checks.get(account.id) ?? null, today);
}

async function buildView(
  sql: Sql,
  account: FinAccount,
  totals: Map<string, import("@/lib/domain/finance/types").AccountTotals>,
  check: BalanceCheck | null,
  today: string,
): Promise<AccountView> {
  const zero = { income_cents: 0, expense_cents: 0, transfer_in_cents: 0, transfer_out_cents: 0 };
  const balance = accountBalance(account.kind, account.opening_balance_cents, totals.get(account.id) ?? zero);
  let lastCheck: AccountView["last_check"] = null;
  if (check) {
    const atCheck = check.date >= today ? totals : await repo.accountTotals(sql, check.date);
    const calculated = accountBalance(account.kind, account.opening_balance_cents, atCheck.get(account.id) ?? zero);
    lastCheck = { ...check, calculated_cents: calculated, difference_cents: check.balance_cents - calculated };
  }
  let statement: AccountView["statement"] = null;
  if (account.kind === "credit_card" && account.statement_close_day) {
    const cycle = cardCycle(today, account.statement_close_day, account.due_day);
    statement = { ...cycle, total_cents: await statementTotal(sql, account.id, cycle.from, cycle.to) };
  }
  return {
    ...account,
    balance_cents: balance,
    available_credit_cents: account.credit_limit_cents === null ? null : account.credit_limit_cents - balance,
    last_check: lastCheck,
    statement,
  };
}

/** Purchases minus refunds on the card in the statement window (payments are not purchases). */
async function statementTotal(sql: Sql, accountId: string, from: string, to: string): Promise<number> {
  const rows = await sql.query<{ total: string | number | null }>(
    `SELECT COALESCE(SUM(CASE WHEN kind = 'expense' THEN amount_cents ELSE -amount_cents END), 0) AS total
     FROM fin_transactions
     WHERE account_id = $1::uuid AND kind IN ('expense', 'income') AND voided_at IS NULL
       AND date BETWEEN $2::date AND $3::date`,
    [accountId, from, to],
  );
  return Number(rows[0]?.total ?? 0);
}

/** The slug is the identity: an existing slug comes back untouched. */
export async function createAccount(sql: Sql, input: AccountInput, today: string) {
  const existing = await repo.getAccountByRef(sql, input.slug);
  if (existing) return { account: await getAccountView(sql, existing.id, today), idempotentReplay: true };
  try {
    const account = await repo.insertAccount(sql, input);
    return { account: await getAccountView(sql, account.id, today), idempotentReplay: false };
  } catch (error) {
    if (isUniqueViolation(error)) {
      const raced = await repo.getAccountByRef(sql, input.slug);
      if (raced) return { account: await getAccountView(sql, raced.id, today), idempotentReplay: true };
    }
    throw error;
  }
}

export async function updateAccount(sql: Sql, ref: string, patch: AccountPatch, today: string): Promise<AccountView> {
  const current = await repo.getAccountByRef(sql, ref);
  if (!current) throw notFound("Account was not found.");
  const kind = patch.kind ?? current.kind;
  const details = cardFieldErrors(kind, {
    credit_limit_cents: patch.credit_limit_cents === undefined ? current.credit_limit_cents : patch.credit_limit_cents,
    statement_close_day: patch.statement_close_day === undefined ? current.statement_close_day : patch.statement_close_day,
    due_day: patch.due_day === undefined ? current.due_day : patch.due_day,
  });
  if (details.length > 0) {
    throw validationError(`${details[0]?.field} is only allowed for a credit card. Clear it first.`, details);
  }
  await repo.updateAccount(sql, current.id, patch);
  return getAccountView(sql, current.id, today);
}

/** "The bank says the balance was X on this date." Idempotent by external_key. */
export async function addBalanceCheck(sql: Sql, ref: string, input: BalanceCheckInput, today: string) {
  const account = await repo.getAccountByRef(sql, ref);
  if (!account) throw notFound("Account was not found.");
  if (input.date > today) {
    throw validationError("date cannot be in the future.", [{ field: "date", message: "cannot be in the future" }]);
  }
  if (input.external_key) {
    const existing = await repo.findBalanceCheckByKey(sql, input.external_key);
    if (existing) {
      if (existing.account_id !== account.id) throw keyTaken();
      return { check: existing, account: await getAccountView(sql, account.id, today), idempotentReplay: true };
    }
  }
  const check = await repo.insertBalanceCheck(sql, account.id, input);
  return { check, account: await getAccountView(sql, account.id, today), idempotentReplay: false };
}

/**
 * Marks the account's transactions up to `through` as cleared, but only when the
 * calculated balance on that date matches the newest balance check on that date.
 */
export async function reconcileAccount(sql: Sql, ref: string, through: string, today: string) {
  const account = await repo.getAccountByRef(sql, ref);
  if (!account) throw notFound("Account was not found.");
  const totals = await repo.accountTotals(sql, through);
  const zero = { income_cents: 0, expense_cents: 0, transfer_in_cents: 0, transfer_out_cents: 0 };
  const calculated = accountBalance(account.kind, account.opening_balance_cents, totals.get(account.id) ?? zero);
  const rows = await sql.query(
    `SELECT balance_cents FROM fin_balance_checks WHERE account_id = $1::uuid AND date = $2::date ORDER BY created_at DESC LIMIT 1`,
    [account.id, through],
  );
  if (!rows[0]) {
    throw validationError("No balance check on that date. POST /balance-checks first.", [
      { field: "through", message: "needs a balance check on the same date" },
    ]);
  }
  const informed = Number(rows[0].balance_cents);
  if (informed !== calculated) {
    return {
      reconciled: false,
      cleared_count: 0,
      calculated_cents: calculated,
      informed_cents: informed,
      difference_cents: informed - calculated,
      account: await getAccountView(sql, account.id, today),
    };
  }
  const cleared = await repo.markCleared(sql, account.id, through);
  return {
    reconciled: true,
    cleared_count: cleared,
    calculated_cents: calculated,
    informed_cents: informed,
    difference_cents: 0,
    account: await getAccountView(sql, account.id, today),
  };
}

function keyTaken() {
  return validationError("external_key already belongs to another record.", [
    { field: "external_key", message: "already belongs to another record" },
  ]);
}
