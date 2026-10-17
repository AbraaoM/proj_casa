import type { ReactNode } from "react";
import { FinanceNav, type FinanceTab } from "@/components/finance/finance-nav";

/** Shared shell of the finance pages: title, tabs, then the page. */
export function FinancePage({
  tab,
  month,
  eyebrow,
  title,
  aside,
  children,
}: {
  tab: FinanceTab;
  month?: string;
  eyebrow?: string;
  title: string;
  aside?: ReactNode;
  children: ReactNode;
}) {
  return (
    <main className="mx-auto w-full max-w-3xl px-5 py-8 md:max-w-5xl md:px-10 md:py-12">
      <header className="flex flex-wrap items-end justify-between gap-x-6 gap-y-3">
        <div className="min-w-0">
          <p className="text-sm text-ink-muted">{eyebrow ?? "Finanças"}</p>
          <h1 className="mt-1 break-words font-display text-5xl leading-none tracking-tight md:text-6xl">{title}</h1>
        </div>
        {aside}
      </header>
      <FinanceNav active={tab} month={month} />
      {children}
    </main>
  );
}
