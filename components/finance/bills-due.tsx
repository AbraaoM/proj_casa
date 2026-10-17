import { attentionPhrase } from "@/lib/domain/attention";
import type { DueBill } from "@/lib/services/finance/summary";
import { dueAttention } from "@/lib/ui/finance";
import { markerClass } from "@/lib/ui/attention";
import { formatMoney } from "@/lib/ui/format";

/** Bills due soon, with the same markers as the dashboard. */
export function BillsDue({ bills }: { bills: DueBill[] }) {
  if (bills.length === 0) return <p className="mt-4 text-sm text-ink-muted">Nada vence nos próximos 30 dias.</p>;
  return (
    <ul className="mt-4 space-y-4">
      {bills.map((bill) => {
        const attention = dueAttention(bill.days_until_due);
        return (
          <li key={bill.id} className={`flex items-baseline justify-between gap-4 border-l-2 pl-3 ${markerClass(attention)}`}>
            <div className="min-w-0">
              <p className="break-words text-base">{bill.name}</p>
              <p className="mt-1 text-sm text-ink-muted">
                {attentionPhrase(attention, bill.days_until_due)}
                {bill.autopay ? " · débito automático" : ""}
              </p>
            </div>
            <p className="shrink-0 text-sm tabular-nums">
              {bill.amount_varies ? "~" : ""}
              {bill.kind === "income" ? "+" : ""}
              {formatMoney(bill.amount_cents)}
            </p>
          </li>
        );
      })}
    </ul>
  );
}
