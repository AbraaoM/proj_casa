import Link from "next/link";
import type { BudgetLine } from "@/lib/domain/finance/budget";
import { budgetRatio } from "@/lib/ui/finance";
import { formatMoney } from "@/lib/ui/format";

/**
 * One thin bar per category. Emerald while inside the budget; over it, the bar
 * fills in black (white in dark mode) and the numbers go bold. No red.
 */
export function BudgetBars({ lines, month, showChildren = false }: { lines: BudgetLine[]; month: string; showChildren?: boolean }) {
  const shown = lines.filter((line) => (showChildren || line.parent_slug === null) && line.budget_cents !== null);
  if (shown.length === 0) {
    return <p className="mt-4 text-sm text-ink-muted">Sem orçamento definido. Peça ao James.</p>;
  }
  return (
    <ul className="mt-4 space-y-4">
      {shown.map((line) => {
        const spent = line.total_spent_cents;
        const ratio = budgetRatio(spent, line.budget_cents);
        return (
          <li key={line.slug} className={line.parent_slug ? "pl-4" : ""}>
            <div className="flex items-baseline justify-between gap-4 text-sm">
              <Link
                href={`/financas/lancamentos?mes=${month}&categoria=${line.slug}`}
                className={`min-w-0 truncate transition-colors duration-300 hover:text-accent-dark focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent dark:hover:text-accent-light ${line.parent_slug ? "text-ink-muted" : ""}`}
              >
                {line.name}
              </Link>
              <p className={`shrink-0 tabular-nums ${line.over ? "font-semibold" : "text-ink-muted"}`}>
                {formatMoney(spent)} <span className="text-ink-faint">de</span> {formatMoney(line.budget_cents ?? 0)}
              </p>
            </div>
            <div
              className="mt-2 h-1 w-full bg-line dark:bg-line-dark"
              role="meter"
              aria-label={`${line.name}: ${Math.round(ratio * 100)}% do orçamento`}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={Math.round(ratio * 100)}
            >
              <div
                className={`h-1 transition-[width] duration-500 ${line.over ? "bg-black dark:bg-white" : "bg-accent"}`}
                style={{ width: `${Math.round(ratio * 100)}%` }}
              />
            </div>
            {line.over ? (
              <p className="mt-1 text-xs font-semibold">{formatMoney(-(line.remaining_cents ?? 0))} acima</p>
            ) : null}
          </li>
        );
      })}
    </ul>
  );
}
