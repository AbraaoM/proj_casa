import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { shiftMonth } from "@/lib/domain/finance/dates";
import { monthLabel } from "@/lib/domain/history";

/** Previous · month · next, as plain links (no JS) that keep the other filters. */
export function MonthNav({ month, basePath, params = {} }: { month: string; basePath: string; params?: Record<string, string | null> }) {
  const href = (target: string) => {
    const search = new URLSearchParams();
    for (const [key, value] of Object.entries(params)) if (value) search.set(key, value);
    search.set("mes", target);
    return `${basePath}?${search.toString()}`;
  };
  const link =
    "inline-flex h-11 w-11 items-center justify-center rounded-full border border-line text-ink-muted transition-colors duration-300 hover:border-black hover:text-black focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent dark:border-line-dark dark:hover:border-white dark:hover:text-white";
  return (
    <div className="flex items-center gap-2">
      <Link href={href(shiftMonth(month, -1))} className={link} aria-label="Mês anterior" scroll={false}>
        <ChevronLeft aria-hidden className="h-5 w-5" strokeWidth={1.75} />
      </Link>
      <p className="min-w-[8.5rem] text-center text-sm">{monthLabel(month)}</p>
      <Link href={href(shiftMonth(month, 1))} className={link} aria-label="Próximo mês" scroll={false}>
        <ChevronRight aria-hidden className="h-5 w-5" strokeWidth={1.75} />
      </Link>
    </div>
  );
}
