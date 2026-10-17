import { describe, expect, test } from "vitest";
import { parseCreateEvent } from "@/lib/domain/events";
import {
  parseAccountCreate,
  parseBillCreate,
  parseBudgetPut,
  parseCategoryCreate,
  parsePay,
  parseTransactionCreate,
  parseTransactionListQuery,
} from "@/lib/domain/finance/validate";
import { parseCreateItem, parseDoneBody, parseItemPatch } from "@/lib/domain/validate";

const fields = (result: { ok: boolean; details?: { field: string }[] }) =>
  result.ok ? [] : (result.details ?? []).map((detail) => detail.field);

describe("accounts", () => {
  test("a card with its days", () => {
    const result = parseAccountCreate({ slug: "nubank", name: "Nubank", kind: "credit_card", statement_close_day: 5, due_day: 12, credit_limit_cents: 500000 });
    expect(result.ok && result.value).toMatchObject({ slug: "nubank", opening_balance_cents: 0, due_day: 12 });
  });
  test("statement days only on cards; negative opening balance is fine", () => {
    expect(fields(parseAccountCreate({ slug: "itau", name: "Itaú", kind: "checking", due_day: 5 }))).toEqual(["due_day"]);
    expect(parseAccountCreate({ slug: "itau", name: "Itaú", kind: "checking", opening_balance_cents: -5000 }).ok).toBe(true);
  });
  test("slug and unknown fields", () => {
    expect(fields(parseAccountCreate({ slug: "Itaú", name: "x", kind: "checking", color: "red" }))).toEqual(["color", "slug"]);
  });
});

describe("categories", () => {
  test("kind is required at top level, inherited under a parent", () => {
    expect(fields(parseCategoryCreate({ slug: "viagem", name: "Viagem" }))).toEqual(["kind"]);
    expect(parseCategoryCreate({ slug: "pets_creche", name: "Creche", parent: "pets" }).ok).toBe(true);
  });
});

describe("transactions", () => {
  const base = { kind: "expense", date: "2026-10-10", amount_cents: 1000, category: "mercado", description: "Mercado" };
  test("expense needs a category; transfer needs both accounts and no category", () => {
    expect(parseTransactionCreate(base).ok).toBe(true);
    expect(fields(parseTransactionCreate({ ...base, category: undefined }))).toEqual(["category"]);
    expect(fields(parseTransactionCreate({ kind: "transfer", date: "2026-10-10", amount_cents: 1, description: "Fatura", account: "itau", category: "x" }))).toEqual(["to_account", "category"]);
    expect(fields(parseTransactionCreate({ kind: "transfer", date: "2026-10-10", amount_cents: 1, description: "x", account: "a", to_account: "a" }))).toEqual(["to_account"]);
  });
  test("amount must be positive; installments need an account", () => {
    expect(fields(parseTransactionCreate({ ...base, amount_cents: 0 }))).toEqual(["amount_cents"]);
    expect(fields(parseTransactionCreate({ ...base, installments: 3 }))).toEqual(["account"]);
    expect(parseTransactionCreate({ ...base, installments: 3, account: "nubank" }).ok).toBe(true);
  });
  test("list query: month expands, origin parses", () => {
    const parsed = parseTransactionListQuery(new URLSearchParams("month=2026-02&origin=dog:6f1c7d9e-3b0a-4c55-9d7e-1a2b3c4d5e6f"));
    expect(parsed.ok && parsed.value).toMatchObject({ from: "2026-02-01", to: "2026-02-28", origin: { domain: "dog" } });
    expect(fields(parseTransactionListQuery(new URLSearchParams("origin=boat")))).toEqual(["origin"]);
    expect(fields(parseTransactionListQuery(new URLSearchParams("month=2026-10&from=2026-10-01")))).toEqual(["month"]);
  });
});

describe("bills", () => {
  test("monthly bill takes its day from next_due_date", () => {
    const result = parseBillCreate({ slug: "energia", name: "Energia", amount_cents: 20000, category: "energia", next_due_date: "2026-10-31" });
    expect(result.ok && result.value).toMatchObject({ frequency: "monthly", interval: 1, day_of_month: 31, status: "active", kind: "bill" });
  });
  test("cannot be created paused or ended", () => {
    expect(fields(parseBillCreate({ slug: "x", name: "x", amount_cents: 1, category: "outros", next_due_date: "2026-10-01", status: "ended" }))).toEqual(["status"]);
  });
  test("pay payload", () => {
    expect(parsePay({ amount_cents: 1, account: "itau" }).ok).toBe(true);
    expect(fields(parsePay({ amount_cents: -1 }))).toEqual(["amount_cents"]);
  });
});

describe("budgets", () => {
  test("null amount removes; month null is the default", () => {
    const result = parseBudgetPut({ items: [{ category: "mercado", amount_cents: 150000 }, { category: "lazer", amount_cents: null }] });
    expect(result.ok && result.value).toEqual({ month: null, items: [{ category: "mercado", amount_cents: 150000 }, { category: "lazer", amount_cents: null }] });
    expect(fields(parseBudgetPut({ month: "2026-13", items: [] }))).toEqual(["month", "items"]);
  });
});

describe("finance fields on events and items", () => {
  test("events accept finance_category and account with an amount", () => {
    const ok = parseCreateEvent({ domain: "house", category: "repair", title: "Sifão", amount_cents: 6000, finance_category: "casa_manutencao", account: "itau" });
    expect(ok.ok && ok.value).toMatchObject({ finance_category: "casa_manutencao", account: "itau" });
    expect(fields(parseCreateEvent({ domain: "house", category: "repair", title: "Sifão", account: "itau" }))).toEqual(["account"]);
    expect(parseDoneBody({ amount_cents: 1000, account: "itau" }).ok).toBe(true);
  });
  test("interval_months is exclusive with interval_days", () => {
    expect(fields(parseCreateItem({ domain: "finance", title: "x", category: "bill", interval_days: 30, interval_months: 1 }))).toEqual(["interval_months"]);
    const patch = parseItemPatch({ interval_months: 3 });
    expect(patch.ok && patch.value).toEqual({ interval_months: 3, interval_days: null });
  });
});
