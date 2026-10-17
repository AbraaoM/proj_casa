import type { FinBill } from "@/lib/domain/finance/types";
import { decideSuggestedBill } from "@/lib/finance/actions";
import { frequencyPhrase } from "@/lib/ui/finance";
import { formatDate, formatMoney } from "@/lib/ui/format";

/**
 * Bills James noticed but could not confirm in chat. Rare by design: the usual
 * path is the owner telling James. Plain forms, so they work without client JS.
 */
export function SuggestedBills({ bills, compact = false }: { bills: FinBill[]; compact?: boolean }) {
  if (bills.length === 0) return null;
  const button =
    "border px-3 py-1.5 text-sm transition-colors duration-300 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent";
  return (
    <div className={compact ? "mt-6" : "mt-4"}>
      <p className="text-sm text-ink-muted">{bills.length === 1 ? "O James sugeriu uma conta." : `O James sugeriu ${bills.length} contas.`}</p>
      <ul className="mt-3 space-y-3">
        {bills.map((bill) => (
          <li key={bill.id} className="border border-dashed border-line p-3 dark:border-line-dark">
            <div className="flex items-baseline justify-between gap-4">
              <p className="min-w-0 break-words text-base">{bill.name}</p>
              <p className="shrink-0 text-sm tabular-nums">{formatMoney(bill.amount_cents)}</p>
            </div>
            <p className="mt-1 text-sm text-ink-muted">
              {frequencyPhrase(bill.frequency, bill.interval)} · próxima em {formatDate(bill.next_due_date)}
            </p>
            <form action={decideSuggestedBill} className="mt-3 flex flex-wrap gap-2">
              <input type="hidden" name="bill_id" value={bill.id} />
              <button
                type="submit"
                name="decision"
                value="confirm"
                className={`${button} border-black bg-black text-white hover:border-accent-dark hover:bg-accent-dark dark:border-white dark:bg-white dark:text-black dark:hover:border-accent-light dark:hover:bg-accent-light`}
              >
                Confirmar
              </button>
              <button
                type="submit"
                name="decision"
                value="dismiss"
                className={`${button} border-line text-ink-muted hover:border-black hover:text-black dark:border-line-dark dark:hover:border-white dark:hover:text-white`}
              >
                Dispensar
              </button>
            </form>
          </li>
        ))}
      </ul>
    </div>
  );
}
