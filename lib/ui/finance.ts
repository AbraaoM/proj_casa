import type { AttentionState } from "@/lib/domain/types";
import type { AccountKind, BillFrequency, BillKind, FinTransaction } from "@/lib/domain/finance/types";
import { formatMoney } from "@/lib/ui/format";

export const ACCOUNT_KIND_LABELS: Record<AccountKind, string> = {
  checking: "Conta corrente",
  savings: "Poupança",
  cash: "Dinheiro",
  credit_card: "Cartão de crédito",
  investment: "Investimento",
  loan: "Empréstimo",
  other: "Outra",
};

export const BILL_KIND_LABELS: Record<BillKind, string> = {
  bill: "Conta",
  subscription: "Assinatura",
  installment: "Parcelamento",
  income: "Entrada",
};

const ORIGIN_LABELS: Record<string, string> = { dog: "Cão", car: "Carro", house: "Casa", family: "Família", finance: "Finanças" };

/** "+R$ 10,00" for income, "R$ 10,00" for expense and transfer. */
export function transactionAmount(tx: Pick<FinTransaction, "kind" | "amount_cents">): string {
  return tx.kind === "income" ? `+${formatMoney(tx.amount_cents)}` : formatMoney(tx.amount_cents);
}

/** The grey line under a transaction: category, account, origin, installment, payee. */
export function transactionDetails(tx: FinTransaction): string {
  const parts: string[] = [];
  if (tx.kind === "transfer") parts.push(`${tx.account_name ?? "?"} → ${tx.to_account_name ?? "?"}`);
  else {
    if (tx.category_name) parts.push(tx.category_name);
    if (tx.account_name) parts.push(tx.account_name);
  }
  if (tx.origin_domain && tx.origin_domain !== "finance") parts.push([ORIGIN_LABELS[tx.origin_domain] ?? tx.origin_domain, tx.origin_subject_name].filter(Boolean).join(" · "));
  if (tx.installment_n && tx.installment_total) parts.push(`${tx.installment_n}/${tx.installment_total}`);
  if (tx.payee && tx.kind !== "transfer") parts.push(tx.payee);
  return parts.join(" · ");
}

export function dueAttention(days: number): AttentionState {
  if (days < 0) return "overdue";
  if (days === 0) return "due_today";
  return "upcoming";
}

export function frequencyPhrase(frequency: BillFrequency, interval: number): string {
  if (frequency === "monthly") return interval === 1 ? "Todo mês" : `A cada ${interval} meses`;
  if (frequency === "yearly") return interval === 1 ? "Todo ano" : `A cada ${interval} anos`;
  if (frequency === "weekly") return interval === 1 ? "Toda semana" : `A cada ${interval} semanas`;
  return `A cada ${interval} dias`;
}

/** Share of the budget used, 0..1, for the thin bars. */
export function budgetRatio(spent: number, budget: number | null): number {
  if (!budget || budget <= 0) return spent > 0 ? 1 : 0;
  return Math.max(0, Math.min(1, spent / budget));
}

/** The ?mes= value, or the current month when missing or malformed. */
export function pickMonth(raw: string | undefined, today: string): string {
  return raw && /^\d{4}-(0[1-9]|1[0-2])$/.test(raw) ? raw : today.slice(0, 7);
}
