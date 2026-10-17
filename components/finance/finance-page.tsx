import type { ReactNode } from "react";
import { BackLink } from "@/components/history/back-link";

export type FinanceTab = "mes" | "lancamentos" | "contas" | "a-pagar" | "orcamento";

/**
 * Shared frame of the finance pages. The main screen has no tabs; the pages below it
 * get a way back instead (the month travels along when it matters).
 */
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
  const back = month && tab !== "contas" && tab !== "a-pagar" ? `/financas?mes=${month}` : "/financas";
  return (
    <main className="mx-auto w-full max-w-3xl px-5 py-6 md:max-w-5xl md:px-10 md:py-12">
      {tab === "mes" ? null : <BackLink href={back} label="Finanças" />}
      <header className="mt-1 flex flex-wrap items-end justify-between gap-x-6 gap-y-3">
        <div className="min-w-0">
          <p className="text-sm text-ink-muted">{eyebrow ?? "Finanças"}</p>
          <h1 className="mt-1 break-words font-display text-5xl leading-none tracking-tight md:text-6xl">{title}</h1>
        </div>
        {aside}
      </header>
      {children}
    </main>
  );
}
