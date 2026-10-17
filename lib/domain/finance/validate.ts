import { isIsoDate, isUuid } from "@/lib/domain/dates";
import { isMonth } from "@/lib/domain/finance/dates";
import {
  ACCOUNT_KINDS,
  BILL_FREQUENCIES,
  BILL_KINDS,
  BILL_STATUSES,
  CATEGORY_KINDS,
  TRANSACTION_KINDS,
  TRANSACTION_SOURCES,
  TRANSACTION_STATUSES,
  type AccountKind,
  type BillFrequency,
  type BillKind,
  type BillStatus,
  type CategoryKind,
  type TransactionKind,
  type TransactionSource,
  type TransactionStatus,
} from "@/lib/domain/finance/types";
import { DOMAINS, type Domain } from "@/lib/domain/types";
import {
  isRecord,
  readDate,
  readEnum,
  readExternalKey,
  readInteger,
  readNotes,
  readQueryEnum,
  readShortText,
  unknownFields,
  type FieldError,
  type ParseResult,
} from "@/lib/domain/validate";

const SLUG = /^[a-z0-9_]{1,40}$/;
const MAX_CENTS = 100_000_000_000;

// ---------- shared readers ----------

function fail<T>(details: FieldError[]): ParseResult<T> {
  return { ok: false, details };
}

function notObject<T>(): ParseResult<T> {
  return fail([{ field: "body", message: "must be a JSON object" }]);
}

function readSlug(body: Record<string, unknown>, field: string, details: FieldError[], required: boolean): string | null {
  const value = body[field];
  if (value === undefined || value === null || value === "") {
    if (required) details.push({ field, message: "is required" });
    return null;
  }
  if (typeof value === "string" && SLUG.test(value)) return value;
  details.push({ field, message: "must be a slug of 1 to 40 characters (a-z, 0-9, _)" });
  return null;
}

/** An account, category or bill addressed by slug or uuid. */
function readRef(body: Record<string, unknown>, field: string, details: FieldError[], required = false): string | null {
  const value = body[field];
  if (value === undefined || value === null || value === "") {
    if (required) details.push({ field, message: "is required" });
    return null;
  }
  if (typeof value === "string" && (SLUG.test(value) || isUuid(value))) return value;
  details.push({ field, message: "must be a slug or a uuid" });
  return null;
}

function readName(body: Record<string, unknown>, field: string, max: number, details: FieldError[], required: boolean) {
  const value = readShortText(body, field, max, details);
  if (value === null && required && !details.some((detail) => detail.field === field)) {
    details.push({ field, message: "is required" });
  }
  return value;
}

function readCents(
  body: Record<string, unknown>,
  field: string,
  details: FieldError[],
  options: { required?: boolean; positive?: boolean; signed?: boolean } = {},
): number | null {
  const value = body[field];
  if (value === undefined || value === null) {
    if (options.required) details.push({ field, message: "is required" });
    return null;
  }
  const min = options.signed ? -MAX_CENTS : options.positive ? 1 : 0;
  if (typeof value !== "number" || !Number.isInteger(value) || value < min || value > MAX_CENTS) {
    details.push({ field, message: options.positive ? "must be a positive integer (cents)" : "must be an integer (cents)" });
    return null;
  }
  return value;
}

function readDay(body: Record<string, unknown>, field: string, details: FieldError[]) {
  return readInteger(body, field, details, 1, 31);
}

function readBool(body: Record<string, unknown>, field: string, details: FieldError[]): boolean | undefined {
  if (!(field in body)) return undefined;
  if (typeof body[field] === "boolean") return body[field] as boolean;
  details.push({ field, message: "must be true or false" });
  return undefined;
}

function requiredDate(body: Record<string, unknown>, field: string, details: FieldError[]): string | null {
  const value = readDate(body, field, details);
  if (value === null && !details.some((detail) => detail.field === field)) details.push({ field, message: "is required" });
  return value;
}

// ---------- accounts ----------

export type AccountInput = {
  slug: string;
  name: string;
  kind: AccountKind;
  opening_balance_cents: number;
  opening_date: string | null;
  credit_limit_cents: number | null;
  statement_close_day: number | null;
  due_day: number | null;
  sort_order: number;
  notes: string | null;
};
export type AccountPatch = Partial<Omit<AccountInput, "slug">> & { archived?: boolean };

const ACCOUNT_FIELDS = [
  "slug", "name", "kind", "opening_balance_cents", "opening_date", "credit_limit_cents",
  "statement_close_day", "due_day", "sort_order", "notes",
];

export function parseAccountCreate(body: unknown): ParseResult<AccountInput> {
  if (!isRecord(body)) return notObject();
  const details = unknownFields(body, new Set(ACCOUNT_FIELDS));
  const slug = readSlug(body, "slug", details, true);
  const name = readName(body, "name", 80, details, true);
  const kind = readEnum(body, "kind", ACCOUNT_KINDS, details, true);
  const opening_balance_cents = readCents(body, "opening_balance_cents", details, { signed: true }) ?? 0;
  const opening_date = readDate(body, "opening_date", details);
  const credit_limit_cents = readCents(body, "credit_limit_cents", details);
  const statement_close_day = readDay(body, "statement_close_day", details);
  const due_day = readDay(body, "due_day", details);
  const sort_order = readInteger(body, "sort_order", details, 0, 10_000) ?? 0;
  const notes = readNotes(body, "notes", details);
  if (kind) cardFieldErrors(kind, { credit_limit_cents, statement_close_day, due_day }, details);
  if (details.length > 0 || !slug || !name || !kind) return fail(details);
  return {
    ok: true,
    value: { slug, name, kind, opening_balance_cents, opening_date, credit_limit_cents, statement_close_day, due_day, sort_order, notes },
  };
}

export function parseAccountPatch(body: unknown): ParseResult<AccountPatch> {
  if (!isRecord(body)) return notObject();
  const details = unknownFields(body, new Set([...ACCOUNT_FIELDS.filter((field) => field !== "slug"), "archived"]));
  const patch: AccountPatch = {};
  if ("name" in body) {
    const name = readName(body, "name", 80, details, true);
    if (name) patch.name = name;
  }
  if ("kind" in body) {
    const kind = readEnum(body, "kind", ACCOUNT_KINDS, details, true);
    if (kind) patch.kind = kind;
  }
  if ("opening_balance_cents" in body) {
    patch.opening_balance_cents = readCents(body, "opening_balance_cents", details, { signed: true }) ?? 0;
  }
  if ("opening_date" in body) patch.opening_date = readDate(body, "opening_date", details);
  if ("credit_limit_cents" in body) patch.credit_limit_cents = readCents(body, "credit_limit_cents", details);
  if ("statement_close_day" in body) patch.statement_close_day = readDay(body, "statement_close_day", details);
  if ("due_day" in body) patch.due_day = readDay(body, "due_day", details);
  if ("sort_order" in body) patch.sort_order = readInteger(body, "sort_order", details, 0, 10_000) ?? 0;
  if ("notes" in body) patch.notes = readNotes(body, "notes", details);
  const archived = readBool(body, "archived", details);
  if (archived !== undefined) patch.archived = archived;
  if (details.length > 0) return fail(details);
  return { ok: true, value: patch };
}

/** Statement days and limits only make sense on a credit card. */
export function cardFieldErrors(
  kind: AccountKind,
  fields: { credit_limit_cents?: number | null; statement_close_day?: number | null; due_day?: number | null },
  details: FieldError[] = [],
): FieldError[] {
  if (kind === "credit_card") return details;
  for (const field of ["credit_limit_cents", "statement_close_day", "due_day"] as const) {
    if (fields[field] !== undefined && fields[field] !== null) {
      details.push({ field, message: "is only allowed for kind credit_card" });
    }
  }
  return details;
}

export type BalanceCheckInput = { date: string; balance_cents: number; external_key: string | null };

export function parseBalanceCheck(body: unknown): ParseResult<BalanceCheckInput> {
  if (!isRecord(body)) return notObject();
  const details = unknownFields(body, new Set(["date", "balance_cents", "external_key"]));
  const date = requiredDate(body, "date", details);
  const balance_cents = readCents(body, "balance_cents", details, { signed: true, required: true });
  const external_key = readExternalKey(body, details);
  if (details.length > 0 || !date || balance_cents === null) return fail(details);
  return { ok: true, value: { date, balance_cents, external_key } };
}

export type ReconcileInput = { through: string };

export function parseReconcile(body: unknown): ParseResult<ReconcileInput> {
  if (!isRecord(body)) return notObject();
  const details = unknownFields(body, new Set(["through"]));
  const through = requiredDate(body, "through", details);
  if (details.length > 0 || !through) return fail(details);
  return { ok: true, value: { through } };
}

// ---------- categories ----------

export type CategoryInput = {
  slug: string;
  name: string;
  kind: CategoryKind | null;
  parent: string | null;
  sort_order: number;
};
export type CategoryPatch = { name?: string; parent?: string | null; sort_order?: number; archived?: boolean };

export function parseCategoryCreate(body: unknown): ParseResult<CategoryInput> {
  if (!isRecord(body)) return notObject();
  const details = unknownFields(body, new Set(["slug", "name", "kind", "parent", "sort_order"]));
  const slug = readSlug(body, "slug", details, true);
  const name = readName(body, "name", 80, details, true);
  const parent = readRef(body, "parent", details);
  // A subcategory inherits its parent's kind.
  const kind = readEnum(body, "kind", CATEGORY_KINDS, details, parent === null);
  const sort_order = readInteger(body, "sort_order", details, 0, 10_000) ?? 0;
  if (details.length > 0 || !slug || !name) return fail(details);
  return { ok: true, value: { slug, name, kind, parent, sort_order } };
}

export function parseCategoryPatch(body: unknown): ParseResult<CategoryPatch> {
  if (!isRecord(body)) return notObject();
  const details = unknownFields(body, new Set(["name", "parent", "sort_order", "archived"]));
  const patch: CategoryPatch = {};
  if ("name" in body) {
    const name = readName(body, "name", 80, details, true);
    if (name) patch.name = name;
  }
  if ("parent" in body) patch.parent = readRef(body, "parent", details);
  if ("sort_order" in body) patch.sort_order = readInteger(body, "sort_order", details, 0, 10_000) ?? 0;
  const archived = readBool(body, "archived", details);
  if (archived !== undefined) patch.archived = archived;
  if (details.length > 0) return fail(details);
  return { ok: true, value: patch };
}

// ---------- transactions ----------

export type TransactionInput = {
  kind: TransactionKind;
  date: string;
  amount_cents: number;
  account: string | null;
  to_account: string | null;
  category: string | null;
  description: string;
  payee: string | null;
  notes: string | null;
  status: TransactionStatus;
  /** A card purchase in N monthly parts: amount_cents is the total. */
  installments: number | null;
  external_key: string | null;
};

export type TransactionPatch = {
  date?: string;
  amount_cents?: number;
  account?: string | null;
  to_account?: string | null;
  category?: string;
  description?: string;
  payee?: string | null;
  notes?: string | null;
  status?: TransactionStatus;
  voided?: boolean;
};

const TX_FIELDS = [
  "kind", "date", "amount_cents", "account", "to_account", "category", "description",
  "payee", "notes", "status", "installments", "external_key",
];

export function parseTransactionCreate(body: unknown): ParseResult<TransactionInput> {
  if (!isRecord(body)) return notObject();
  const details = unknownFields(body, new Set(TX_FIELDS));
  const kind = readEnum(body, "kind", TRANSACTION_KINDS, details, true);
  const date = requiredDate(body, "date", details);
  const amount_cents = readCents(body, "amount_cents", details, { required: true, positive: true });
  const account = readRef(body, "account", details);
  const to_account = readRef(body, "to_account", details);
  const category = readRef(body, "category", details);
  const description = readName(body, "description", 160, details, true);
  const payee = readShortText(body, "payee", 120, details);
  const notes = readNotes(body, "notes", details);
  const status = readEnum(body, "status", TRANSACTION_STATUSES, details, false) ?? "pending";
  const installments = readInteger(body, "installments", details, 2, 120);
  const external_key = readExternalKey(body, details);

  if (kind === "transfer") {
    if (!account) details.push({ field: "account", message: "is required for a transfer" });
    if (!to_account) details.push({ field: "to_account", message: "is required for a transfer" });
    if (category) details.push({ field: "category", message: "must be empty for a transfer" });
    if (account && to_account && account === to_account) {
      details.push({ field: "to_account", message: "must differ from account" });
    }
  } else if (kind) {
    if (!category) details.push({ field: "category", message: "is required" });
    if (to_account) details.push({ field: "to_account", message: "is only allowed for a transfer" });
  }
  if (installments !== null) {
    if (kind !== "expense") details.push({ field: "installments", message: "is only allowed for an expense" });
    if (!account) details.push({ field: "account", message: "is required with installments" });
    if (amount_cents !== null && amount_cents < installments) {
      details.push({ field: "amount_cents", message: "must be at least one cent per installment" });
    }
  }

  if (details.length > 0 || !kind || !date || amount_cents === null || !description) return fail(details);
  return {
    ok: true,
    value: { kind, date, amount_cents, account, to_account, category, description, payee, notes, status, installments, external_key },
  };
}

export function parseTransactionPatch(body: unknown): ParseResult<TransactionPatch> {
  if (!isRecord(body)) return notObject();
  const details = unknownFields(
    body,
    new Set(["date", "amount_cents", "account", "to_account", "category", "description", "payee", "notes", "status", "voided"]),
  );
  const patch: TransactionPatch = {};
  if ("date" in body) {
    const date = requiredDate(body, "date", details);
    if (date) patch.date = date;
  }
  if ("amount_cents" in body) {
    const amount = readCents(body, "amount_cents", details, { required: true, positive: true });
    if (amount !== null) patch.amount_cents = amount;
  }
  if ("account" in body) patch.account = readRef(body, "account", details);
  if ("to_account" in body) patch.to_account = readRef(body, "to_account", details);
  if ("category" in body) {
    const category = readRef(body, "category", details, true);
    if (category) patch.category = category;
  }
  if ("description" in body) {
    const description = readName(body, "description", 160, details, true);
    if (description) patch.description = description;
  }
  if ("payee" in body) patch.payee = readShortText(body, "payee", 120, details);
  if ("notes" in body) patch.notes = readNotes(body, "notes", details);
  if ("status" in body) {
    const status = readEnum(body, "status", TRANSACTION_STATUSES, details, true);
    if (status) patch.status = status;
  }
  const voided = readBool(body, "voided", details);
  if (voided !== undefined) patch.voided = voided;
  if (details.length > 0) return fail(details);
  return { ok: true, value: patch };
}

export type TransactionListQuery = {
  from: string | null;
  to: string | null;
  account: string | null;
  category: string | null;
  kind: TransactionKind | null;
  status: TransactionStatus | null;
  source: TransactionSource | null;
  bill: string | null;
  /** The sector subject behind a care-event cost: "dog:<uuid>", or just a domain like "car". */
  origin: { domain: Domain; subject_id: string | null } | null;
  q: string | null;
  include_voided: boolean;
  limit: number;
  offset: number;
};

export function parseTransactionListQuery(params: URLSearchParams): ParseResult<TransactionListQuery> {
  const details: FieldError[] = [];
  let from = readQueryDate(params, "from", details);
  let to = readQueryDate(params, "to", details);
  const month = params.get("month");
  if (month) {
    if (!isMonth(month)) details.push({ field: "month", message: "must be YYYY-MM" });
    else if (from || to) details.push({ field: "month", message: "send month or from/to, not both" });
    else {
      from = `${month}-01`;
      const [y, m] = month.split("-").map(Number) as [number, number];
      to = `${month}-${String(new Date(Date.UTC(y, m, 0)).getUTCDate()).padStart(2, "0")}`;
    }
  }
  if (from && to && from > to) details.push({ field: "from", message: "must be on or before to" });
  const account = readQueryRef(params, "account", details);
  const category = readQueryRef(params, "category", details);
  const bill = readQueryRef(params, "bill", details);
  const kind = readQueryEnum(params, "kind", TRANSACTION_KINDS, details);
  const status = readQueryEnum(params, "status", TRANSACTION_STATUSES, details);
  const source = readQueryEnum(params, "source", TRANSACTION_SOURCES, details);
  const origin = readOrigin(params.get("origin"), details);
  const qRaw = params.get("q")?.trim() ?? "";
  if (qRaw.length > 80) details.push({ field: "q", message: "must be at most 80 characters" });
  const include_voided = params.get("include_voided") === "1";
  const limit = readQueryInt(params, "limit", 1, 500, 100, details);
  const offset = readQueryInt(params, "offset", 0, 100_000, 0, details);
  if (details.length > 0) return fail(details);
  return {
    ok: true,
    value: { from, to, account, category, kind, status, source, bill, origin, q: qRaw || null, include_voided, limit, offset },
  };
}

export function readOrigin(raw: string | null, details: FieldError[]): TransactionListQuery["origin"] {
  if (!raw) return null;
  const [domain, id, extra] = raw.split(":");
  if (!domain || !(DOMAINS as readonly string[]).includes(domain) || extra !== undefined || (id !== undefined && !isUuid(id))) {
    details.push({ field: "origin", message: "must be a domain, or domain:uuid (e.g. dog:<uuid>)" });
    return null;
  }
  return { domain: domain as Domain, subject_id: id ?? null };
}

// ---------- bills ----------

export type BillInput = {
  slug: string;
  name: string;
  kind: BillKind;
  amount_cents: number;
  amount_varies: boolean;
  category: string;
  account: string | null;
  frequency: BillFrequency;
  interval: number;
  day_of_month: number | null;
  next_due_date: string;
  end_date: string | null;
  remaining: number | null;
  autopay: boolean;
  status: "suggested" | "active";
  care_item_id: string | null;
  notes: string | null;
  external_key: string | null;
};

export type BillPatch = Partial<Omit<BillInput, "slug" | "external_key" | "care_item_id" | "status">> & {
  status?: BillStatus;
};

const BILL_FIELDS = [
  "slug", "name", "kind", "amount_cents", "amount_varies", "category", "account", "frequency",
  "interval", "day_of_month", "next_due_date", "end_date", "remaining", "autopay", "status",
  "care_item_id", "notes", "external_key",
];

export function parseBillCreate(body: unknown): ParseResult<BillInput> {
  if (!isRecord(body)) return notObject();
  const details = unknownFields(body, new Set(BILL_FIELDS));
  const slug = readSlug(body, "slug", details, true);
  const name = readName(body, "name", 80, details, true);
  const kind = readEnum(body, "kind", BILL_KINDS, details, false) ?? "bill";
  const amount_cents = readCents(body, "amount_cents", details, { required: true, positive: true });
  const amount_varies = readBool(body, "amount_varies", details) ?? false;
  const category = readRef(body, "category", details, true);
  const account = readRef(body, "account", details);
  const frequency = readEnum(body, "frequency", BILL_FREQUENCIES, details, false) ?? "monthly";
  const interval = readInteger(body, "interval", details, 1, 366) ?? 1;
  const next_due_date = requiredDate(body, "next_due_date", details);
  const dayRaw = readDay(body, "day_of_month", details);
  const end_date = readDate(body, "end_date", details);
  const remaining = readInteger(body, "remaining", details, 1, 600);
  const autopay = readBool(body, "autopay", details) ?? false;
  const statusRaw = readEnum(body, "status", BILL_STATUSES, details, false) ?? "active";
  if (statusRaw !== "suggested" && statusRaw !== "active") {
    details.push({ field: "status", message: "must be suggested or active when creating" });
  }
  const care_item_id = readUuidField(body, "care_item_id", details);
  const notes = readNotes(body, "notes", details);
  const external_key = readExternalKey(body, details);
  recurrenceErrors(frequency, interval, details);
  if (end_date && next_due_date && end_date < next_due_date) {
    details.push({ field: "end_date", message: "must be on or after next_due_date" });
  }
  if (details.length > 0 || !slug || !name || amount_cents === null || !category || !next_due_date) return fail(details);
  // Monthly and yearly bills keep the day they were first due on (31 stays 31).
  const day_of_month =
    dayRaw ?? (frequency === "monthly" || frequency === "yearly" ? Number(next_due_date.slice(8, 10)) : null);
  return {
    ok: true,
    value: {
      slug, name, kind, amount_cents, amount_varies, category, account, frequency, interval, day_of_month,
      next_due_date, end_date, remaining, autopay, status: statusRaw as "suggested" | "active", care_item_id, notes, external_key,
    },
  };
}

export function parseBillPatch(body: unknown): ParseResult<BillPatch> {
  if (!isRecord(body)) return notObject();
  const allowed = BILL_FIELDS.filter((field) => !["slug", "external_key", "care_item_id"].includes(field));
  const details = unknownFields(body, new Set(allowed));
  const patch: BillPatch = {};
  if ("name" in body) {
    const name = readName(body, "name", 80, details, true);
    if (name) patch.name = name;
  }
  if ("kind" in body) {
    const kind = readEnum(body, "kind", BILL_KINDS, details, true);
    if (kind) patch.kind = kind;
  }
  if ("amount_cents" in body) {
    const amount = readCents(body, "amount_cents", details, { required: true, positive: true });
    if (amount !== null) patch.amount_cents = amount;
  }
  const varies = readBool(body, "amount_varies", details);
  if (varies !== undefined) patch.amount_varies = varies;
  if ("category" in body) {
    const category = readRef(body, "category", details, true);
    if (category) patch.category = category;
  }
  if ("account" in body) patch.account = readRef(body, "account", details);
  if ("frequency" in body) {
    const frequency = readEnum(body, "frequency", BILL_FREQUENCIES, details, true);
    if (frequency) patch.frequency = frequency;
  }
  if ("interval" in body) {
    const interval = readInteger(body, "interval", details, 1, 366);
    if (interval !== null) patch.interval = interval;
  }
  if ("day_of_month" in body) patch.day_of_month = readDay(body, "day_of_month", details);
  if ("next_due_date" in body) {
    const date = requiredDate(body, "next_due_date", details);
    if (date) patch.next_due_date = date;
  }
  if ("end_date" in body) patch.end_date = readDate(body, "end_date", details);
  if ("remaining" in body) patch.remaining = readInteger(body, "remaining", details, 0, 600);
  const autopay = readBool(body, "autopay", details);
  if (autopay !== undefined) patch.autopay = autopay;
  if ("status" in body) {
    const status = readEnum(body, "status", BILL_STATUSES, details, true);
    if (status) patch.status = status;
  }
  if ("notes" in body) patch.notes = readNotes(body, "notes", details);
  if (patch.frequency || patch.interval) {
    recurrenceErrors(patch.frequency ?? "monthly", patch.interval ?? 1, details);
  }
  if (details.length > 0) return fail(details);
  return { ok: true, value: patch };
}

function recurrenceErrors(frequency: BillFrequency, interval: number, details: FieldError[]) {
  if ((frequency === "monthly" && interval > 120) || (frequency === "yearly" && interval > 10) || (frequency === "weekly" && interval > 52)) {
    details.push({ field: "interval", message: `is too large for ${frequency}` });
  }
}

export type PayInput = {
  paid_on: string | null;
  amount_cents: number | null;
  account: string | null;
  notes: string | null;
  external_key: string | null;
};

export function parsePay(body: unknown): ParseResult<PayInput> {
  if (!isRecord(body)) return notObject();
  const details = unknownFields(body, new Set(["paid_on", "amount_cents", "account", "notes", "external_key"]));
  const paid_on = readDate(body, "paid_on", details);
  const amount_cents = readCents(body, "amount_cents", details, { positive: true });
  const account = readRef(body, "account", details);
  const notes = readNotes(body, "notes", details);
  const external_key = readExternalKey(body, details);
  if (details.length > 0) return fail(details);
  return { ok: true, value: { paid_on, amount_cents, account, notes, external_key } };
}

// ---------- budgets ----------

export type BudgetPut = { month: string | null; items: Array<{ category: string; amount_cents: number | null }> };

export function parseBudgetPut(body: unknown): ParseResult<BudgetPut> {
  if (!isRecord(body)) return notObject();
  const details = unknownFields(body, new Set(["month", "items"]));
  let month: string | null = null;
  if (body.month !== undefined && body.month !== null) {
    if (typeof body.month === "string" && isMonth(body.month)) month = body.month;
    else details.push({ field: "month", message: "must be YYYY-MM, or null for the default budget" });
  }
  const items: BudgetPut["items"] = [];
  if (!Array.isArray(body.items) || body.items.length === 0 || body.items.length > 100) {
    details.push({ field: "items", message: "must be an array of 1 to 100 entries" });
  } else {
    body.items.forEach((raw, index) => {
      if (!isRecord(raw)) {
        details.push({ field: `items[${index}]`, message: "must be an object" });
        return;
      }
      const inner: FieldError[] = unknownFields(raw, new Set(["category", "amount_cents"]));
      const category = readRef(raw, "category", inner, true);
      // null removes the budget.
      const amount = raw.amount_cents === null ? null : readCents(raw, "amount_cents", inner, { required: true });
      for (const detail of inner) details.push({ field: `items[${index}].${detail.field}`, message: detail.message });
      if (category && inner.length === 0) items.push({ category, amount_cents: amount });
    });
  }
  if (details.length > 0) return fail(details);
  return { ok: true, value: { month, items } };
}

export function parseMonthQuery(params: URLSearchParams, today: string): ParseResult<string> {
  const month = params.get("month");
  if (!month) return { ok: true, value: today.slice(0, 7) };
  if (!isMonth(month)) return fail([{ field: "month", message: "must be YYYY-MM" }]);
  return { ok: true, value: month };
}

// ---------- event extras ----------

/** Optional finance fields on POST /events and /items/:id/done. */
export type EventFinanceInput = { finance_category: string | null; account: string | null };

export function readEventFinance(body: Record<string, unknown>, details: FieldError[]): EventFinanceInput {
  return { finance_category: readRef(body, "finance_category", details), account: readRef(body, "account", details) };
}

// ---------- query helpers ----------

function readQueryRef(params: URLSearchParams, field: string, details: FieldError[]): string | null {
  const value = params.get(field);
  if (!value) return null;
  if (SLUG.test(value) || isUuid(value)) return value;
  details.push({ field, message: "must be a slug or a uuid" });
  return null;
}

function readQueryDate(params: URLSearchParams, field: string, details: FieldError[]): string | null {
  const value = params.get(field);
  if (!value) return null;
  if (isIsoDate(value)) return value;
  details.push({ field, message: "must be YYYY-MM-DD" });
  return null;
}

function readQueryInt(
  params: URLSearchParams,
  field: string,
  min: number,
  max: number,
  fallback: number,
  details: FieldError[],
): number {
  const value = params.get(field);
  if (value === null) return fallback;
  if (!/^\d+$/.test(value) || Number(value) < min || Number(value) > max) {
    details.push({ field, message: `must be an integer from ${min} to ${max}` });
    return fallback;
  }
  return Number(value);
}

function readUuidField(body: Record<string, unknown>, field: string, details: FieldError[]): string | null {
  const value = body[field];
  if (value === undefined || value === null || value === "") return null;
  if (typeof value === "string" && isUuid(value)) return value;
  details.push({ field, message: "must be a uuid" });
  return null;
}

export { readRef, SLUG as FINANCE_SLUG };
