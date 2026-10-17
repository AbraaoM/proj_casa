import { bool, dateOnly, integerOrNull, nullableText, text, timestamp } from "@/lib/db/rows";
import { isLiability } from "@/lib/domain/finance/money";
import type {
  AccountKind,
  BalanceCheck,
  BillFrequency,
  BillKind,
  BillStatus,
  CategoryKind,
  FinAccount,
  FinBill,
  FinCategory,
  FinTransaction,
  TransactionKind,
  TransactionSource,
  TransactionStatus,
} from "@/lib/domain/finance/types";

const cents = (value: unknown) => integerOrNull(value) ?? 0;
const stamp = (value: unknown) => (value == null ? null : timestamp(value));

export function mapAccount(row: Record<string, unknown>): FinAccount {
  const kind = text(row.kind) as AccountKind;
  return {
    id: text(row.id),
    slug: text(row.slug),
    name: text(row.name),
    kind,
    is_liability: isLiability(kind),
    opening_balance_cents: cents(row.opening_balance_cents),
    opening_date: dateOnly(row.opening_date),
    credit_limit_cents: integerOrNull(row.credit_limit_cents),
    statement_close_day: integerOrNull(row.statement_close_day),
    due_day: integerOrNull(row.due_day),
    sort_order: cents(row.sort_order),
    notes: nullableText(row.notes),
    archived_at: stamp(row.archived_at),
    created_by_agent: bool(row.created_by_agent),
    created_at: timestamp(row.created_at),
    updated_at: timestamp(row.updated_at),
  };
}

export function mapCategory(row: Record<string, unknown>): FinCategory {
  return {
    id: text(row.id),
    slug: text(row.slug),
    name: text(row.name),
    kind: text(row.kind) as CategoryKind,
    parent_id: nullableText(row.parent_id),
    parent_slug: nullableText(row.parent_slug),
    sort_order: cents(row.sort_order),
    archived_at: stamp(row.archived_at),
    created_by_agent: bool(row.created_by_agent),
    created_at: timestamp(row.created_at),
    updated_at: timestamp(row.updated_at),
  };
}

export function mapTransaction(row: Record<string, unknown>): FinTransaction {
  return {
    id: text(row.id),
    kind: text(row.kind) as TransactionKind,
    date: dateOnly(row.date) ?? text(row.date),
    amount_cents: cents(row.amount_cents),
    account_id: nullableText(row.account_id),
    account_slug: nullableText(row.account_slug),
    account_name: nullableText(row.account_name),
    to_account_id: nullableText(row.to_account_id),
    to_account_slug: nullableText(row.to_account_slug),
    to_account_name: nullableText(row.to_account_name),
    category_id: nullableText(row.category_id),
    category_slug: nullableText(row.category_slug),
    category_name: nullableText(row.category_name),
    category_kind: (nullableText(row.category_kind) as CategoryKind | null) ?? null,
    parent_category_slug: nullableText(row.parent_category_slug),
    description: text(row.description),
    payee: nullableText(row.payee),
    notes: nullableText(row.notes),
    status: text(row.status) as TransactionStatus,
    source: text(row.source) as TransactionSource,
    care_event_id: nullableText(row.care_event_id),
    origin_domain: nullableText(row.origin_domain),
    origin_subject_name: nullableText(row.origin_subject_name),
    bill_id: nullableText(row.bill_id),
    bill_slug: nullableText(row.bill_slug),
    installment_group: nullableText(row.installment_group),
    installment_n: integerOrNull(row.installment_n),
    installment_total: integerOrNull(row.installment_total),
    external_key: nullableText(row.external_key),
    voided_at: stamp(row.voided_at),
    created_by_agent: bool(row.created_by_agent),
    created_at: timestamp(row.created_at),
    updated_at: timestamp(row.updated_at),
  };
}

export function mapBill(row: Record<string, unknown>): FinBill {
  return {
    id: text(row.id),
    slug: text(row.slug),
    name: text(row.name),
    kind: text(row.kind) as BillKind,
    amount_cents: cents(row.amount_cents),
    amount_varies: bool(row.amount_varies),
    category_id: text(row.category_id),
    category_slug: text(row.category_slug),
    category_name: text(row.category_name),
    account_id: nullableText(row.account_id),
    account_slug: nullableText(row.account_slug),
    frequency: text(row.frequency) as BillFrequency,
    interval: cents(row.interval),
    day_of_month: integerOrNull(row.day_of_month),
    next_due_date: dateOnly(row.next_due_date) ?? text(row.next_due_date),
    end_date: dateOnly(row.end_date),
    remaining: integerOrNull(row.remaining),
    autopay: bool(row.autopay),
    status: text(row.status) as BillStatus,
    care_item_id: nullableText(row.care_item_id),
    notes: nullableText(row.notes),
    external_key: nullableText(row.external_key),
    created_by_agent: bool(row.created_by_agent),
    created_at: timestamp(row.created_at),
    updated_at: timestamp(row.updated_at),
  };
}

export function mapBalanceCheck(row: Record<string, unknown>): BalanceCheck {
  return {
    id: text(row.id),
    account_id: text(row.account_id),
    date: dateOnly(row.date) ?? text(row.date),
    balance_cents: cents(row.balance_cents),
    external_key: nullableText(row.external_key),
    created_by_agent: bool(row.created_by_agent),
    created_at: timestamp(row.created_at),
  };
}
