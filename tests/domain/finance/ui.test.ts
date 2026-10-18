import { describe, expect, test } from "vitest";
import type { FinTransaction } from "@/lib/domain/finance/types";
import { budgetRatio, dueAttention, frequencyPhrase, pickMonth, transactionAmount, transactionDetails } from "@/lib/ui/finance";

const tx = (over: Partial<FinTransaction>) =>
  ({
    kind: "expense", amount_cents: 18000, category_name: "Saúde dos pets", account_name: "Itaú", to_account_name: null,
    origin_domain: "dog", origin_subject_name: "Thor", installment_n: null, installment_total: null, payee: "Clínica", ...over,
  }) as FinTransaction;

describe("finance ui helpers", () => {
  test("amount sign", () => {
    expect(transactionAmount(tx({ kind: "income", amount_cents: 100 }))).toBe("+R$ 1,00");
    expect(transactionAmount(tx({}))).toBe("R$ 180,00");
  });
  test("details line", () => {
    expect(transactionDetails(tx({}))).toBe("Saúde dos pets · Itaú · Cão · Thor · Clínica");
    expect(transactionDetails(tx({ kind: "transfer", account_name: "Itaú", to_account_name: "Nubank", origin_domain: null, payee: null }))).toBe("Itaú → Nubank");
    expect(transactionDetails(tx({ origin_domain: "finance", installment_n: 2, installment_total: 10, payee: null }))).toBe("Saúde dos pets · Itaú · 2/10");
  });
  test("details skip a category or payee that repeats the description", () => {
    const market = { description: "Mercado", category_name: "Mercado", payee: "mercado", origin_domain: null, account_name: "Conta corrente" };
    expect(transactionDetails(tx(market))).toBe("Conta corrente");
  });
  test("due marker, frequency, ratio and month", () => {
    expect([dueAttention(-1), dueAttention(0), dueAttention(3)]).toEqual(["overdue", "due_today", "upcoming"]);
    expect(frequencyPhrase("monthly", 1)).toBe("Todo mês");
    expect(frequencyPhrase("yearly", 2)).toBe("A cada 2 anos");
    expect([budgetRatio(50, 100), budgetRatio(150, 100), budgetRatio(10, null)]).toEqual([0.5, 1, 1]);
    expect([pickMonth("2026-02", "2026-10-16"), pickMonth("x", "2026-10-16"), pickMonth(undefined, "2026-10-16")]).toEqual(["2026-02", "2026-10", "2026-10"]);
  });
});
