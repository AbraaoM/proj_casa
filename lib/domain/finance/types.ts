export const ACCOUNT_KINDS = ["checking", "savings", "cash", "credit_card", "investment", "loan", "other"] as const;
export type AccountKind = (typeof ACCOUNT_KINDS)[number];
/** Liabilities: the balance is what is owed. */
export const LIABILITY_KINDS: readonly AccountKind[] = ["credit_card", "loan"];

export const CATEGORY_KINDS = ["expense", "income"] as const;
export type CategoryKind = (typeof CATEGORY_KINDS)[number];

export const TRANSACTION_KINDS = ["expense", "income", "transfer"] as const;
export type TransactionKind = (typeof TRANSACTION_KINDS)[number];

export const TRANSACTION_STATUSES = ["pending", "cleared"] as const;
export type TransactionStatus = (typeof TRANSACTION_STATUSES)[number];

export const TRANSACTION_SOURCES = ["manual", "care_event", "bill"] as const;
export type TransactionSource = (typeof TRANSACTION_SOURCES)[number];

export const BILL_KINDS = ["bill", "subscription", "installment", "income"] as const;
export type BillKind = (typeof BILL_KINDS)[number];

export const BILL_FREQUENCIES = ["monthly", "yearly", "weekly", "every_n_days"] as const;
export type BillFrequency = (typeof BILL_FREQUENCIES)[number];

export const BILL_STATUSES = ["suggested", "active", "paused", "ended"] as const;
export type BillStatus = (typeof BILL_STATUSES)[number];

export type FinAccount = {
  id: string;
  slug: string;
  name: string;
  kind: AccountKind;
  is_liability: boolean;
  opening_balance_cents: number;
  opening_date: string | null;
  credit_limit_cents: number | null;
  statement_close_day: number | null;
  due_day: number | null;
  sort_order: number;
  notes: string | null;
  archived_at: string | null;
  created_by_agent: boolean;
  created_at: string;
  updated_at: string;
};

export type FinCategory = {
  id: string;
  slug: string;
  name: string;
  kind: CategoryKind;
  parent_id: string | null;
  parent_slug: string | null;
  sort_order: number;
  archived_at: string | null;
  created_by_agent: boolean;
  created_at: string;
  updated_at: string;
};

export type FinTransaction = {
  id: string;
  kind: TransactionKind;
  date: string;
  amount_cents: number;
  account_id: string | null;
  account_slug: string | null;
  account_name: string | null;
  to_account_id: string | null;
  to_account_slug: string | null;
  to_account_name: string | null;
  category_id: string | null;
  category_slug: string | null;
  category_name: string | null;
  category_kind: CategoryKind | null;
  parent_category_slug: string | null;
  description: string;
  payee: string | null;
  notes: string | null;
  status: TransactionStatus;
  source: TransactionSource;
  care_event_id: string | null;
  /** From the linked care event: "dog", "car", ... and the subject's name. */
  origin_domain: string | null;
  origin_subject_name: string | null;
  bill_id: string | null;
  bill_slug: string | null;
  installment_group: string | null;
  installment_n: number | null;
  installment_total: number | null;
  external_key: string | null;
  voided_at: string | null;
  created_by_agent: boolean;
  created_at: string;
  updated_at: string;
};

export type FinBill = {
  id: string;
  slug: string;
  name: string;
  kind: BillKind;
  amount_cents: number;
  amount_varies: boolean;
  category_id: string;
  category_slug: string;
  category_name: string;
  account_id: string | null;
  account_slug: string | null;
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
  created_by_agent: boolean;
  created_at: string;
  updated_at: string;
};

export type BalanceCheck = {
  id: string;
  account_id: string;
  date: string;
  balance_cents: number;
  external_key: string | null;
  created_by_agent: boolean;
  created_at: string;
};

/** Sums of live transactions touching one account, up to a date. */
export type AccountTotals = {
  income_cents: number;
  expense_cents: number;
  transfer_in_cents: number;
  transfer_out_cents: number;
};

export type BudgetRow = {
  category_id: string;
  month: string | null;
  amount_cents: number;
};

/** Listed by GET /api/agent/health so the agent knows the allowed values. Categories: GET /finance/categories. */
export const FINANCE_ENUMS = {
  account_kinds: ACCOUNT_KINDS,
  transaction_kinds: TRANSACTION_KINDS,
  bill_kinds: BILL_KINDS,
  bill_frequencies: BILL_FREQUENCIES,
  bill_statuses: BILL_STATUSES,
} as const;
