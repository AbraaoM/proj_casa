"use client";

import { useActionState } from "react";
import { Check } from "lucide-react";
import { payBillFromScreen, type PayState } from "@/lib/finance/pay-actions";

const INITIAL: PayState = { status: "idle", message: null };

/**
 * "Paguei" next to a bill. Fixed bills pay the expected amount in one tap; variable
 * ones (energy, water) show the expected value in a field to adjust first.
 */
export function PayButton({
  billId,
  dueDate,
  name,
  variable,
  expected,
  align = "end",
}: {
  billId: string;
  dueDate: string;
  name: string;
  variable: boolean;
  expected: string;
  align?: "start" | "end";
}) {
  const [state, action, pending] = useActionState(payBillFromScreen, INITIAL);
  if (state.status === "paid") {
    return (
      <p className="inline-flex min-h-11 items-center gap-1 text-sm text-accent-dark dark:text-accent-light" role="status">
        <Check aria-hidden className="h-4 w-4" strokeWidth={2} /> Pago
      </p>
    );
  }
  return (
    <form action={action} className={`flex shrink-0 flex-col gap-1 ${align === "start" ? "items-start" : "items-end"}`}>
      <input type="hidden" name="bill_id" value={billId} />
      <input type="hidden" name="due_date" value={dueDate} />
      <div className="flex items-center gap-2">
        {variable ? (
          <label className="flex items-center gap-1 text-sm text-ink-muted">
            <span aria-hidden>R$</span>
            <span className="sr-only">Valor pago de {name}</span>
            <input
              name="amount"
              defaultValue={expected}
              inputMode="decimal"
              autoComplete="off"
              className="h-11 w-24 rounded-md border border-line bg-transparent px-2 text-right text-base tabular-nums text-black outline-none focus:border-accent dark:border-line-dark dark:text-white"
            />
          </label>
        ) : null}
        <button
          type="submit"
          disabled={pending}
          aria-label={`Paguei ${name}`}
          className="min-h-11 rounded-full bg-accent px-4 text-sm font-medium text-soft-black transition-colors duration-300 hover:bg-accent-light focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:opacity-60"
        >
          {pending ? "Salvando…" : "Paguei"}
        </button>
      </div>
      {state.status === "error" ? (
        <p className="text-xs" role="alert">
          {state.message}
        </p>
      ) : null}
    </form>
  );
}
