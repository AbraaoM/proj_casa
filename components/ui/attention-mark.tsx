import { CircleAlert, CircleCheck } from "lucide-react";
import type { AttentionState } from "@/lib/domain/types";

/** Small sign before an item: alert when late, emerald dot when due today. */
export function AttentionMark({ attention }: { attention: AttentionState }) {
  if (attention === "overdue") {
    return <CircleAlert aria-label="Atrasado" role="img" className="mr-1.5 inline h-4 w-4 -translate-y-px align-middle" strokeWidth={2} />;
  }
  if (attention === "due_today") {
    return <span aria-label="Vence hoje" role="img" className="mr-2 inline-block h-2 w-2 -translate-y-px rounded-full bg-accent align-middle" />;
  }
  return null;
}

/** Empty list, with a calm check instead of a bare line of text. */
export function EmptyNote({ children }: { children: React.ReactNode }) {
  return (
    <p className="mt-4 flex items-center gap-2 text-sm text-ink-muted">
      <CircleCheck aria-hidden className="h-4 w-4 shrink-0 text-accent-dark dark:text-accent-light" strokeWidth={1.75} />
      {children}
    </p>
  );
}
