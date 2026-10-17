import Link from "next/link";
import { ChevronRight } from "lucide-react";
import type { ReactNode } from "react";

const FOCUS = "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent";

/** A short "see more" link with a real touch target (44 px) and a quiet chevron. */
export function MoreLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <Link
      href={href}
      className={`inline-flex min-h-11 items-center gap-1 rounded-md text-sm text-accent-dark transition-colors duration-300 hover:text-black dark:text-accent-light dark:hover:text-white ${FOCUS}`}
    >
      {children}
      <ChevronRight aria-hidden className="h-4 w-4" strokeWidth={1.75} />
    </Link>
  );
}

/** A whole row that opens a page: label, optional detail and a chevron. Last row of a card. */
export function RowLink({ href, children, detail }: { href: string; children: ReactNode; detail?: ReactNode }) {
  return (
    <Link
      href={href}
      className={`group flex min-h-14 items-center gap-3 border-t border-line text-sm transition-colors duration-300 active:bg-line/50 dark:border-line-dark dark:active:bg-line-dark ${FOCUS}`}
    >
      <span className="min-w-0 flex-1">{children}</span>
      {detail ? <span className="text-ink-muted">{detail}</span> : null}
      <ChevronRight aria-hidden className="h-5 w-5 shrink-0 text-ink-faint transition-transform duration-300 group-hover:translate-x-0.5" strokeWidth={1.75} />
    </Link>
  );
}
