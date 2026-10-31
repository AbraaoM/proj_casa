import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { addDays } from "@/lib/domain/dates";
import { dayHeading } from "@/lib/ui/day";

/** Previous · day · next. Next stops at today. Plain links, so a search stays put. */
export function DayNav({ day, today, query }: { day: string; today: string; query: string }) {
  const href = (target: string) => {
    const search = new URLSearchParams();
    if (target !== today) search.set("dia", target);
    if (query) search.set("q", query);
    const text = search.toString();
    return text ? `/hoje?${text}` : "/hoje";
  };
  const link =
    "inline-flex h-11 w-11 items-center justify-center rounded-full border border-line text-ink-muted transition-colors duration-300 hover:border-black hover:text-black focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent dark:border-line-dark dark:hover:border-white dark:hover:text-white";
  const next = addDays(day, 1);
  const atToday = day >= today;
  return (
    <div className="mt-6 flex items-center gap-2">
      <Link href={href(addDays(day, -1))} className={link} aria-label="Dia anterior" scroll={false}>
        <ChevronLeft aria-hidden className="h-5 w-5" strokeWidth={1.75} />
      </Link>
      <p className="min-w-[6.5rem] text-center text-sm">{dayHeading(day, today)}</p>
      {atToday ? (
        <span className={`${link} pointer-events-none opacity-40`} aria-hidden>
          <ChevronRight className="h-5 w-5" strokeWidth={1.75} />
        </span>
      ) : (
        <Link href={href(next)} className={link} aria-label="Próximo dia" scroll={false}>
          <ChevronRight aria-hidden className="h-5 w-5" strokeWidth={1.75} />
        </Link>
      )}
    </div>
  );
}
