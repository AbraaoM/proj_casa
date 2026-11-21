import type { TrialState } from "@/lib/tenant/scope";

/** One line above the app while the 14-day trial runs. Nothing for a family that never expires. */
export function TrialBanner({ trial }: { trial: TrialState }) {
  if (trial.daysLeft === null || trial.expired) return null;
  const days = trial.daysLeft === 1 ? "falta 1 dia" : `faltam ${trial.daysLeft} dias`;
  return (
    <p className="border-b border-line bg-accent/10 px-5 py-2 text-center text-sm dark:border-line-dark md:pl-24 lg:pl-64" role="status">
      Teste grátis: {days}. Depois disso a família fica só para consulta.
    </p>
  );
}
