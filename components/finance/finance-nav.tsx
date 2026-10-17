import Link from "next/link";

const TABS = [
  { key: "mes", href: "/financas", label: "Mês" },
  { key: "lancamentos", href: "/financas/lancamentos", label: "Lançamentos" },
  { key: "contas", href: "/financas/contas", label: "Contas" },
  { key: "a-pagar", href: "/financas/contas-a-pagar", label: "A pagar" },
  { key: "orcamento", href: "/financas/orcamento", label: "Orçamento" },
] as const;

export type FinanceTab = (typeof TABS)[number]["key"];

/** Section tabs. Scrolls sideways on narrow phones instead of wrapping. */
export function FinanceNav({ active, month }: { active: FinanceTab; month?: string }) {
  return (
    <nav aria-label="Finanças" className="-mx-5 mt-6 overflow-x-auto px-5 md:mx-0 md:px-0">
      <ul className="flex gap-5 border-b border-line text-sm dark:border-line-dark">
        {TABS.map((tab) => {
          const withMonth = month && (tab.key === "mes" || tab.key === "lancamentos" || tab.key === "orcamento");
          const selected = tab.key === active;
          return (
            <li key={tab.key}>
              <Link
                href={withMonth ? `${tab.href}?mes=${month}` : tab.href}
                aria-current={selected ? "page" : undefined}
                className={`-mb-px inline-block whitespace-nowrap border-b-2 pb-2 transition-colors duration-300 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent ${
                  selected
                    ? "border-black text-black dark:border-white dark:text-white"
                    : "border-transparent text-ink-muted hover:text-black dark:hover:text-white"
                }`}
              >
                {tab.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
