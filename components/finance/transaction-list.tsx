import { monthLabel } from "@/lib/domain/history";
import type { FinTransaction } from "@/lib/domain/finance/types";
import { transactionAmount, transactionDetails } from "@/lib/ui/finance";
import { dayAndMonth } from "@/lib/ui/format";

/** Transactions grouped by day (and by month when they span several), newest first. */
export function TransactionList({
  transactions,
  emptyText = "Nenhum lançamento. O James preenche isso.",
}: {
  transactions: FinTransaction[];
  emptyText?: string;
}) {
  if (transactions.length === 0) return <p className="mt-6 text-sm text-ink-muted">{emptyText}</p>;
  const months = new Map<string, Map<string, FinTransaction[]>>();
  for (const tx of transactions) {
    const month = tx.date.slice(0, 7);
    const days = months.get(month) ?? new Map<string, FinTransaction[]>();
    days.set(tx.date, [...(days.get(tx.date) ?? []), tx]);
    months.set(month, days);
  }
  const showMonths = months.size > 1;
  return (
    <div className="mt-4 space-y-6">
      {[...months.entries()].map(([month, days]) => (
        <section key={month} aria-label={monthLabel(month)}>
          {showMonths ? <h3 className="pt-2 text-xs uppercase tracking-wider text-ink-muted">{monthLabel(month)}</h3> : null}
          <ol className={showMonths ? "mt-1" : ""}>
            {[...days.entries()].map(([date, items]) => (
              <DayRow key={date} date={date} items={items} />
            ))}
          </ol>
        </section>
      ))}
    </div>
  );
}

function DayRow({ date, items }: { date: string; items: FinTransaction[] }) {
  const { day, month } = dayAndMonth(date);
  return (
    <li className="grid grid-cols-[3rem_minmax(0,1fr)] gap-x-3 border-t border-line py-4 first:border-t-0 dark:border-line-dark">
      <p className="leading-none">
        <span className="block font-display text-2xl">{day}</span>
        <span className="mt-1 block text-xs text-ink-muted">{month}</span>
      </p>
      <ul className="min-w-0 space-y-3">
        {items.map((tx) => {
          const details = transactionDetails(tx);
          return (
            <li key={tx.id} className="flex items-baseline justify-between gap-4">
              <div className="min-w-0">
                <p className="break-words text-base">{tx.description}</p>
                {details ? <p className="mt-1 break-words text-sm text-ink-muted">{details}</p> : null}
              </div>
              <p className={`shrink-0 text-right text-sm tabular-nums ${tx.kind === "transfer" ? "text-ink-muted" : ""}`}>
                {transactionAmount(tx)}
              </p>
            </li>
          );
        })}
      </ul>
    </li>
  );
}
