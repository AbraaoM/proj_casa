import type { ReactNode } from "react";

/** A single highlighted number with a label, e.g. "Peso · 19,6 kg". */
export function Stat({ label, value, hint, children }: { label: string; value: string; hint?: string | null; children?: ReactNode }) {
  return (
    <div className="border-t border-line pt-3 dark:border-line-dark">
      <p className="text-xs uppercase tracking-wider text-ink-muted">{label}</p>
      <p className="mt-1 font-display text-2xl leading-tight tracking-tight">{value}</p>
      {hint ? <p className="mt-1 text-sm text-ink-muted">{hint}</p> : null}
      {children}
    </div>
  );
}
