import { shiftMonth } from "@/lib/domain/finance/dates";
import { monthLabel } from "@/lib/domain/history";
import { closeMonthAction } from "@/lib/finance/actions";
import type { CloseOffer } from "@/lib/services/finance/close";
import { formatDate } from "@/lib/ui/format";

const BUTTON =
  "inline-flex min-h-11 items-center rounded-md border border-black bg-black px-4 text-sm text-white transition-colors duration-300 hover:border-accent-dark hover:bg-accent-dark focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent dark:border-white dark:bg-white dark:text-black dark:hover:border-accent-light dark:hover:bg-accent-light";

/** One tap to close a finished month, or the PDF once it is closed. */
export function MonthClose({ offer }: { offer: CloseOffer }) {
  const name = monthLabel(offer.month);
  const next = monthLabel(shiftMonth(offer.month, 1));
  if (offer.kind === "pdf") {
    return (
      <section aria-label="Fechamento" className="mt-6 rounded-xl border border-line px-4 py-4 dark:border-line-dark">
        <p className="text-sm text-ink-muted">
          {name} foi fechado em {formatDate(offer.closed_on)}.
        </p>
        <a href={`/financas/fechamento/${offer.month}`} className={`${BUTTON} mt-3`}>
          Abrir PDF
        </a>
      </section>
    );
  }
  return (
    <section aria-label="Fechamento" className="mt-6 rounded-xl border border-line px-4 py-4 dark:border-line-dark">
      <p className="text-sm text-ink-muted">
        Os lançamentos de {name} já podem ser fechados. O PDF traz o resumo e a previsão de {next}.
      </p>
      <form action={closeMonthAction} className="mt-3">
        <input type="hidden" name="month" value={offer.month} />
        <button type="submit" className={BUTTON}>
          Fechar {name.split(" de ")[0]}
        </button>
      </form>
    </section>
  );
}
