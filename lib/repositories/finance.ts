import type { Sql } from "@/lib/db/client";
import { mapAccount, mapBalanceCheck, mapBill, mapCategory, mapTransaction } from "@/lib/db/finance-rows";
import { integerOrNull, text } from "@/lib/db/rows";
import type {
  AccountTotals,
  BalanceCheck,
  BillFrequency,
  BillKind,
  BillStatus,
  BudgetRow,
  CategoryKind,
  FinAccount,
  FinBill,
  FinCategory,
  FinTransaction,
  TransactionKind,
  TransactionSource,
  TransactionStatus,
} from "@/lib/domain/finance/types";
import type { AccountInput, AccountPatch, TransactionListQuery } from "@/lib/domain/finance/validate";
import type { Domain } from "@/lib/domain/types";

/** Builds "col = $n" assignments for a partial update. */
function updater() {
  const assignments: string[] = [];
  const params: unknown[] = [];
  return {
    assignments,
    params,
    set(fragment: string, value: unknown) {
      params.push(value);
      assignments.push(fragment.replace("$#", `$${params.length}`));
    },
    raw(fragment: string) {
      assignments.push(fragment);
    },
  };
}

const byRef = (alias: string, index: number) => `(${alias}.id::text = $${index} OR ${alias}.slug = $${index})`;

// ---------- accounts ----------

export async function listAccounts(sql: Sql, includeArchived = false): Promise<FinAccount[]> {
  const rows = await sql.query(
    `SELECT * FROM fin_accounts ${includeArchived ? "" : "WHERE archived_at IS NULL"} ORDER BY sort_order, name`,
  );
  return rows.map(mapAccount);
}

export async function getAccountByRef(sql: Sql, ref: string): Promise<FinAccount | null> {
  const rows = await sql.query(`SELECT * FROM fin_accounts a WHERE ${byRef("a", 1)}`, [ref]);
  return rows[0] ? mapAccount(rows[0]) : null;
}

export async function insertAccount(sql: Sql, input: AccountInput): Promise<FinAccount> {
  const rows = await sql.query(
    `INSERT INTO fin_accounts (slug, name, kind, opening_balance_cents, opening_date, credit_limit_cents,
       statement_close_day, due_day, sort_order, notes, created_by_agent)
     VALUES ($1, $2, $3, $4, $5::date, $6, $7, $8, $9, $10, true)
     RETURNING *`,
    [input.slug, input.name, input.kind, input.opening_balance_cents, input.opening_date, input.credit_limit_cents,
      input.statement_close_day, input.due_day, input.sort_order, input.notes],
  );
  return mapAccount(rows[0] as Record<string, unknown>);
}

export async function updateAccount(sql: Sql, id: string, patch: AccountPatch): Promise<FinAccount | null> {
  const u = updater();
  if (patch.name !== undefined) u.set("name = $#", patch.name);
  if (patch.kind !== undefined) u.set("kind = $#", patch.kind);
  if (patch.opening_balance_cents !== undefined) u.set("opening_balance_cents = $#", patch.opening_balance_cents);
  if (patch.opening_date !== undefined) u.set("opening_date = $#::date", patch.opening_date);
  if (patch.credit_limit_cents !== undefined) u.set("credit_limit_cents = $#", patch.credit_limit_cents);
  if (patch.statement_close_day !== undefined) u.set("statement_close_day = $#", patch.statement_close_day);
  if (patch.due_day !== undefined) u.set("due_day = $#", patch.due_day);
  if (patch.sort_order !== undefined) u.set("sort_order = $#", patch.sort_order);
  if (patch.notes !== undefined) u.set("notes = $#", patch.notes);
  if (patch.archived === true) u.raw("archived_at = COALESCE(archived_at, now())");
  if (patch.archived === false) u.raw("archived_at = NULL");
  if (u.assignments.length > 0) {
    u.params.push(id);
    await sql.query(`UPDATE fin_accounts SET ${u.assignments.join(", ")} WHERE id = $${u.params.length}::uuid`, u.params);
  }
  return getAccountByRef(sql, id);
}

/** Live (not voided) totals per account, on or before `through`. */
export async function accountTotals(sql: Sql, through: string): Promise<Map<string, AccountTotals>> {
  const rows = await sql.query(
    `SELECT a.id,
       COALESCE(SUM(t.amount_cents) FILTER (WHERE t.kind = 'income' AND t.account_id = a.id), 0) AS income,
       COALESCE(SUM(t.amount_cents) FILTER (WHERE t.kind = 'expense' AND t.account_id = a.id), 0) AS expense,
       COALESCE(SUM(t.amount_cents) FILTER (WHERE t.kind = 'transfer' AND t.to_account_id = a.id), 0) AS transfer_in,
       COALESCE(SUM(t.amount_cents) FILTER (WHERE t.kind = 'transfer' AND t.account_id = a.id), 0) AS transfer_out
     FROM fin_accounts a
     LEFT JOIN fin_transactions t
       ON (t.account_id = a.id OR t.to_account_id = a.id)
      AND t.voided_at IS NULL
      AND t.date <= $1::date
      AND (a.opening_date IS NULL OR t.date >= a.opening_date)
     GROUP BY a.id`,
    [through],
  );
  return new Map(
    rows.map((row) => [
      text(row.id),
      {
        income_cents: integerOrNull(row.income) ?? 0,
        expense_cents: integerOrNull(row.expense) ?? 0,
        transfer_in_cents: integerOrNull(row.transfer_in) ?? 0,
        transfer_out_cents: integerOrNull(row.transfer_out) ?? 0,
      },
    ]),
  );
}

export async function insertBalanceCheck(
  sql: Sql,
  accountId: string,
  input: { date: string; balance_cents: number; external_key: string | null },
): Promise<BalanceCheck> {
  const rows = await sql.query(
    `INSERT INTO fin_balance_checks (account_id, date, balance_cents, external_key, created_by_agent)
     VALUES ($1::uuid, $2::date, $3, $4, true) RETURNING *`,
    [accountId, input.date, input.balance_cents, input.external_key],
  );
  return mapBalanceCheck(rows[0] as Record<string, unknown>);
}

export async function findBalanceCheckByKey(sql: Sql, key: string): Promise<BalanceCheck | null> {
  const rows = await sql.query(`SELECT * FROM fin_balance_checks WHERE external_key = $1`, [key]);
  return rows[0] ? mapBalanceCheck(rows[0]) : null;
}

export async function lastBalanceChecks(sql: Sql): Promise<Map<string, BalanceCheck>> {
  const rows = await sql.query(
    `SELECT DISTINCT ON (account_id) * FROM fin_balance_checks ORDER BY account_id, date DESC, created_at DESC`,
  );
  return new Map(rows.map((row) => [text(row.account_id), mapBalanceCheck(row)]));
}

export async function markCleared(sql: Sql, accountId: string, through: string): Promise<number> {
  const rows = await sql.query(
    `UPDATE fin_transactions SET status = 'cleared'
     WHERE (account_id = $1::uuid OR to_account_id = $1::uuid)
       AND date <= $2::date AND voided_at IS NULL AND status = 'pending'
     RETURNING id`,
    [accountId, through],
  );
  return rows.length;
}

// ---------- categories ----------

const CATEGORY_SQL = `SELECT c.*, p.slug AS parent_slug FROM fin_categories c LEFT JOIN fin_categories p ON p.id = c.parent_id`;

export async function listCategories(sql: Sql, includeArchived = false): Promise<FinCategory[]> {
  const rows = await sql.query(
    `${CATEGORY_SQL} ${includeArchived ? "" : "WHERE c.archived_at IS NULL"}
     ORDER BY c.kind, COALESCE(p.sort_order, c.sort_order), COALESCE(p.slug, c.slug), c.parent_id NULLS FIRST, c.sort_order, c.name`,
  );
  return rows.map(mapCategory);
}

export async function getCategoryByRef(sql: Sql, ref: string): Promise<FinCategory | null> {
  const rows = await sql.query(`${CATEGORY_SQL} WHERE ${byRef("c", 1)}`, [ref]);
  return rows[0] ? mapCategory(rows[0]) : null;
}

export async function insertCategory(
  sql: Sql,
  input: { slug: string; name: string; kind: CategoryKind; parent_id: string | null; sort_order: number },
): Promise<FinCategory> {
  const rows = await sql.query<{ id: string }>(
    `INSERT INTO fin_categories (slug, name, kind, parent_id, sort_order, created_by_agent)
     VALUES ($1, $2, $3, $4::uuid, $5, true) RETURNING id`,
    [input.slug, input.name, input.kind, input.parent_id, input.sort_order],
  );
  return (await getCategoryByRef(sql, text(rows[0]?.id))) as FinCategory;
}

export async function updateCategory(
  sql: Sql,
  id: string,
  patch: { name?: string; parent_id?: string | null; sort_order?: number; archived?: boolean },
): Promise<FinCategory | null> {
  const u = updater();
  if (patch.name !== undefined) u.set("name = $#", patch.name);
  if (patch.parent_id !== undefined) u.set("parent_id = $#::uuid", patch.parent_id);
  if (patch.sort_order !== undefined) u.set("sort_order = $#", patch.sort_order);
  if (patch.archived === true) u.raw("archived_at = COALESCE(archived_at, now())");
  if (patch.archived === false) u.raw("archived_at = NULL");
  if (u.assignments.length > 0) {
    u.params.push(id);
    await sql.query(`UPDATE fin_categories SET ${u.assignments.join(", ")} WHERE id = $${u.params.length}::uuid`, u.params);
  }
  return getCategoryByRef(sql, id);
}

export async function countCategoryChildren(sql: Sql, id: string): Promise<number> {
  const rows = await sql.query(`SELECT count(*)::int AS n FROM fin_categories WHERE parent_id = $1::uuid`, [id]);
  return integerOrNull(rows[0]?.n) ?? 0;
}

// ---------- transactions ----------

const TX_SQL = `
  SELECT t.*,
    a.slug AS account_slug, a.name AS account_name,
    ta.slug AS to_account_slug, ta.name AS to_account_name,
    c.slug AS category_slug, c.name AS category_name, c.kind AS category_kind,
    pc.slug AS parent_category_slug,
    b.slug AS bill_slug,
    ce.domain AS origin_domain,
    COALESCE(d.name, v.name, f.name, ha.name) AS origin_subject_name
  FROM fin_transactions t
  LEFT JOIN fin_accounts a ON a.id = t.account_id
  LEFT JOIN fin_accounts ta ON ta.id = t.to_account_id
  LEFT JOIN fin_categories c ON c.id = t.category_id
  LEFT JOIN fin_categories pc ON pc.id = c.parent_id
  LEFT JOIN fin_bills b ON b.id = t.bill_id
  LEFT JOIN care_events ce ON ce.id = t.care_event_id
  LEFT JOIN dogs d ON d.id = ce.dog_id
  LEFT JOIN vehicles v ON v.id = ce.vehicle_id
  LEFT JOIN family_members f ON f.id = ce.family_member_id
  LEFT JOIN house_areas ha ON ha.id = ce.area_id
`;

export type TransactionWrite = {
  kind: TransactionKind;
  date: string;
  amount_cents: number;
  account_id: string | null;
  to_account_id: string | null;
  category_id: string | null;
  description: string;
  payee: string | null;
  notes: string | null;
  status: TransactionStatus;
  source: TransactionSource;
  care_event_id: string | null;
  bill_id: string | null;
  installment_group: string | null;
  installment_n: number | null;
  installment_total: number | null;
  external_key: string | null;
};

export type TransactionUpdate = Partial<
  Pick<TransactionWrite, "date" | "amount_cents" | "account_id" | "to_account_id" | "category_id" | "description" | "payee" | "notes" | "status">
> & { voided?: boolean };

export async function listTransactions(
  sql: Sql,
  query: TransactionListQuery,
): Promise<{ transactions: FinTransaction[]; total: number }> {
  const params: unknown[] = [];
  const where: string[] = [];
  const add = (fragment: string, value: unknown) => {
    params.push(value);
    where.push(fragment.replaceAll("$#", `$${params.length}`));
  };
  if (!query.include_voided) where.push("t.voided_at IS NULL");
  if (query.from) add("t.date >= $#::date", query.from);
  if (query.to) add("t.date <= $#::date", query.to);
  if (query.account) add("(a.id::text = $# OR a.slug = $# OR ta.id::text = $# OR ta.slug = $#)", query.account);
  if (query.category) add("(c.id::text = $# OR c.slug = $# OR pc.id::text = $# OR pc.slug = $#)", query.category);
  if (query.bill) add("(b.id::text = $# OR b.slug = $#)", query.bill);
  if (query.kind) add("t.kind = $#", query.kind);
  if (query.status) add("t.status = $#", query.status);
  if (query.source) add("t.source = $#", query.source);
  if (query.origin) {
    add("ce.domain = $#", query.origin.domain);
    if (query.origin.subject_id) {
      add("COALESCE(ce.dog_id, ce.vehicle_id, ce.family_member_id, ce.area_id)::text = $#", query.origin.subject_id);
    }
  }
  if (query.q) add("(t.description ILIKE $# OR t.payee ILIKE $# OR t.notes ILIKE $#)", `%${query.q.replace(/[%_\\]/g, "\\$&")}%`);
  const clause = where.length > 0 ? `WHERE ${where.join(" AND ")}` : "";
  const countRows = await sql.query(`SELECT count(*)::int AS n FROM (${TX_SQL} ${clause}) q`, params);
  const rows = await sql.query(
    `${TX_SQL} ${clause} ORDER BY t.date DESC, t.created_at DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
    [...params, query.limit, query.offset],
  );
  return { transactions: rows.map(mapTransaction), total: integerOrNull(countRows[0]?.n) ?? 0 };
}

export async function getTransaction(sql: Sql, id: string): Promise<FinTransaction | null> {
  const rows = await sql.query(`${TX_SQL} WHERE t.id::text = $1`, [id]);
  return rows[0] ? mapTransaction(rows[0]) : null;
}

export async function findTransactionByExternalKey(sql: Sql, key: string): Promise<FinTransaction | null> {
  const rows = await sql.query(`${TX_SQL} WHERE t.external_key = $1`, [key]);
  return rows[0] ? mapTransaction(rows[0]) : null;
}

export async function findTransactionByEvent(sql: Sql, eventId: string): Promise<FinTransaction | null> {
  const rows = await sql.query(`${TX_SQL} WHERE t.care_event_id = $1::uuid`, [eventId]);
  return rows[0] ? mapTransaction(rows[0]) : null;
}

export async function listInstallmentGroup(sql: Sql, group: string): Promise<FinTransaction[]> {
  const rows = await sql.query(`${TX_SQL} WHERE t.installment_group = $1::uuid ORDER BY t.installment_n`, [group]);
  return rows.map(mapTransaction);
}

/** Inserts many rows in one statement (all or nothing). */
export async function insertTransactions(sql: Sql, writes: TransactionWrite[]): Promise<FinTransaction[]> {
  const columns = [
    "kind", "date", "amount_cents", "account_id", "to_account_id", "category_id", "description", "payee", "notes",
    "status", "source", "care_event_id", "bill_id", "installment_group", "installment_n", "installment_total", "external_key",
  ] as const;
  const casts: Record<string, string> = {
    date: "::date", account_id: "::uuid", to_account_id: "::uuid", category_id: "::uuid",
    care_event_id: "::uuid", bill_id: "::uuid", installment_group: "::uuid",
  };
  const params: unknown[] = [];
  const values = writes.map((write) => {
    const placeholders = columns.map((column) => {
      params.push(write[column]);
      return `$${params.length}${casts[column] ?? ""}`;
    });
    return `(${placeholders.join(", ")}, true)`;
  });
  const rows = await sql.query<{ id: string }>(
    `INSERT INTO fin_transactions (${columns.join(", ")}, created_by_agent) VALUES ${values.join(", ")} RETURNING id`,
    params,
  );
  const ids = rows.map((row) => text(row.id));
  const read = await sql.query(`${TX_SQL} WHERE t.id = ANY($1::uuid[]) ORDER BY t.installment_n NULLS FIRST, t.date`, [ids]);
  return read.map(mapTransaction);
}

export async function updateTransaction(sql: Sql, id: string, patch: TransactionUpdate): Promise<FinTransaction | null> {
  const u = updater();
  if (patch.date !== undefined) u.set("date = $#::date", patch.date);
  if (patch.amount_cents !== undefined) u.set("amount_cents = $#", patch.amount_cents);
  if (patch.account_id !== undefined) u.set("account_id = $#::uuid", patch.account_id);
  if (patch.to_account_id !== undefined) u.set("to_account_id = $#::uuid", patch.to_account_id);
  if (patch.category_id !== undefined) u.set("category_id = $#::uuid", patch.category_id);
  if (patch.description !== undefined) u.set("description = $#", patch.description);
  if (patch.payee !== undefined) u.set("payee = $#", patch.payee);
  if (patch.notes !== undefined) u.set("notes = $#", patch.notes);
  if (patch.status !== undefined) u.set("status = $#", patch.status);
  if (patch.voided === true) u.raw("voided_at = COALESCE(voided_at, now())");
  if (patch.voided === false) u.raw("voided_at = NULL");
  if (u.assignments.length > 0) {
    u.params.push(id);
    await sql.query(`UPDATE fin_transactions SET ${u.assignments.join(", ")} WHERE id = $${u.params.length}::uuid`, u.params);
  }
  return getTransaction(sql, id);
}

/** Live amounts per category in a date range, split by transaction kind (income in an expense category is a refund). */
export async function categoryFlows(
  sql: Sql,
  from: string,
  to: string,
): Promise<Array<{ category_id: string; kind: "expense" | "income"; amount_cents: number }>> {
  const rows = await sql.query(
    `SELECT category_id, kind, SUM(amount_cents) AS total
     FROM fin_transactions
     WHERE voided_at IS NULL AND kind <> 'transfer' AND date BETWEEN $1::date AND $2::date
     GROUP BY category_id, kind`,
    [from, to],
  );
  return rows.map((row) => ({
    category_id: text(row.category_id),
    kind: text(row.kind) as "expense" | "income",
    amount_cents: integerOrNull(row.total) ?? 0,
  }));
}

/** Expense per month (net of refunds) per category, for the trend bars. */
export async function monthlyExpense(
  sql: Sql,
  from: string,
  to: string,
): Promise<Array<{ month: string; category_id: string; amount_cents: number }>> {
  const rows = await sql.query(
    `SELECT to_char(t.date, 'YYYY-MM') AS month, t.category_id,
       SUM(CASE WHEN t.kind = 'expense' THEN t.amount_cents ELSE -t.amount_cents END) AS total
     FROM fin_transactions t JOIN fin_categories c ON c.id = t.category_id
     WHERE t.voided_at IS NULL AND c.kind = 'expense' AND t.date BETWEEN $1::date AND $2::date
     GROUP BY 1, 2`,
    [from, to],
  );
  return rows.map((row) => ({
    month: text(row.month),
    category_id: text(row.category_id),
    amount_cents: integerOrNull(row.total) ?? 0,
  }));
}

// ---------- bills ----------

const BILL_SQL = `
  SELECT b.*, c.slug AS category_slug, c.name AS category_name, a.slug AS account_slug
  FROM fin_bills b
  JOIN fin_categories c ON c.id = b.category_id
  LEFT JOIN fin_accounts a ON a.id = b.account_id
`;

export type BillWrite = {
  slug: string;
  name: string;
  kind: BillKind;
  amount_cents: number;
  amount_varies: boolean;
  category_id: string;
  account_id: string | null;
  frequency: BillFrequency;
  interval: number;
  day_of_month: number | null;
  next_due_date: string;
  end_date: string | null;
  remaining: number | null;
  autopay: boolean;
  status: BillStatus;
  care_item_id: string | null;
  notes: string | null;
  external_key: string | null;
};

export async function listBills(sql: Sql, statuses: BillStatus[] | null = null): Promise<FinBill[]> {
  const rows = statuses
    ? await sql.query(`${BILL_SQL} WHERE b.status = ANY($1::text[]) ORDER BY b.next_due_date, b.name`, [statuses])
    : await sql.query(`${BILL_SQL} ORDER BY b.next_due_date, b.name`);
  return rows.map(mapBill);
}

export async function getBillByRef(sql: Sql, ref: string): Promise<FinBill | null> {
  const rows = await sql.query(`${BILL_SQL} WHERE ${byRef("b", 1)}`, [ref]);
  return rows[0] ? mapBill(rows[0]) : null;
}

export async function findBillByExternalKey(sql: Sql, key: string): Promise<FinBill | null> {
  const rows = await sql.query(`${BILL_SQL} WHERE b.external_key = $1`, [key]);
  return rows[0] ? mapBill(rows[0]) : null;
}

export async function findBillByItem(sql: Sql, itemId: string): Promise<FinBill | null> {
  const rows = await sql.query(`${BILL_SQL} WHERE b.care_item_id = $1::uuid`, [itemId]);
  return rows[0] ? mapBill(rows[0]) : null;
}

export async function insertBill(sql: Sql, write: BillWrite): Promise<FinBill> {
  const rows = await sql.query<{ id: string }>(
    `INSERT INTO fin_bills (slug, name, kind, amount_cents, amount_varies, category_id, account_id, frequency, interval,
       day_of_month, next_due_date, end_date, remaining, autopay, status, care_item_id, notes, external_key, created_by_agent)
     VALUES ($1, $2, $3, $4, $5, $6::uuid, $7::uuid, $8, $9, $10, $11::date, $12::date, $13, $14, $15, $16::uuid, $17, $18, true)
     RETURNING id`,
    [write.slug, write.name, write.kind, write.amount_cents, write.amount_varies, write.category_id, write.account_id,
      write.frequency, write.interval, write.day_of_month, write.next_due_date, write.end_date, write.remaining,
      write.autopay, write.status, write.care_item_id, write.notes, write.external_key],
  );
  return (await getBillByRef(sql, text(rows[0]?.id))) as FinBill;
}

export async function updateBill(sql: Sql, id: string, patch: Partial<Omit<BillWrite, "slug" | "external_key">>): Promise<FinBill | null> {
  const u = updater();
  const casts: Record<string, string> = { category_id: "::uuid", account_id: "::uuid", care_item_id: "::uuid", next_due_date: "::date", end_date: "::date" };
  for (const [key, value] of Object.entries(patch)) {
    if (value === undefined) continue;
    u.set(`"${key}" = $#${casts[key] ?? ""}`, value);
  }
  if (u.assignments.length > 0) {
    u.params.push(id);
    await sql.query(`UPDATE fin_bills SET ${u.assignments.join(", ")} WHERE id = $${u.params.length}::uuid`, u.params);
  }
  return getBillByRef(sql, id);
}

// ---------- budgets ----------

export async function listBudgets(sql: Sql, monthStart: string | "all"): Promise<BudgetRow[]> {
  const rows =
    monthStart === "all"
      ? await sql.query(`SELECT category_id, month, amount_cents FROM fin_budgets`)
      : await sql.query(
          `SELECT category_id, month, amount_cents FROM fin_budgets WHERE month IS NULL OR month = $1::date`,
          [monthStart],
        );
  return rows.map((row) => ({
    category_id: text(row.category_id),
    month: row.month == null ? null : String(row.month instanceof Date ? row.month.toISOString() : row.month).slice(0, 10),
    amount_cents: integerOrNull(row.amount_cents) ?? 0,
  }));
}

export async function upsertBudget(sql: Sql, categoryId: string, monthStart: string | null, amount: number): Promise<void> {
  await sql.query(
    `INSERT INTO fin_budgets (category_id, month, amount_cents) VALUES ($1::uuid, $2::date, $3)
     ON CONFLICT (category_id, COALESCE(month, DATE '0001-01-01')) DO UPDATE SET amount_cents = EXCLUDED.amount_cents`,
    [categoryId, monthStart, amount],
  );
}

export async function deleteBudget(sql: Sql, categoryId: string, monthStart: string | null): Promise<void> {
  await sql.query(
    `DELETE FROM fin_budgets WHERE category_id = $1::uuid AND month IS NOT DISTINCT FROM $2::date`,
    [categoryId, monthStart],
  );
}

export type { Domain };
