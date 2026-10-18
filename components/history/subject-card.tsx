import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { attentionPhrase } from "@/lib/domain/attention";
import type { AttentionItem } from "@/lib/domain/types";
import { markerClass } from "@/lib/ui/attention";
import { EmptyNote } from "@/components/ui/attention-mark";
import { ItemActions } from "@/components/one-tap/item-actions";

/**
 * A card in a list page (dogs, cars, family, areas). The header is the link; the
 * next item sits below it with its one-tap buttons (a button cannot live inside a link).
 */
export function SubjectCard({
  href,
  title,
  subtitle,
  next,
  lines,
  compact = false,
}: {
  href: string;
  title: string;
  subtitle: string | null;
  next: AttentionItem | null;
  lines: string[];
  compact?: boolean;
}) {
  return (
    <li className="h-full border-t border-line pt-4 dark:border-line-dark">
      <Link
        href={href}
        className="group block focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-accent"
      >
        <div className="flex min-h-11 items-baseline justify-between gap-4">
          <h2 className={`font-display leading-tight tracking-tight ${compact ? "text-2xl" : "text-3xl"} transition-colors duration-300 group-hover:text-accent-dark dark:group-hover:text-accent-light`}>
            {title}
          </h2>
          <ChevronRight aria-hidden className="h-5 w-5 shrink-0 text-ink-faint transition-transform duration-300 group-hover:translate-x-0.5" strokeWidth={1.75} />
        </div>
        {subtitle ? <p className="mt-1 text-sm text-ink-muted">{subtitle}</p> : null}
      </Link>
      {next ? (
        <div className={`mt-4 border-l-2 pl-3 ${markerClass(next.attention)}`}>
          <p className="text-base">
            {next.title}
            <span className="block text-sm text-ink-muted">{attentionPhrase(next.attention, next.days_until_due, next.next_due_time ?? null)}</span>
          </p>
          <ItemActions item={next} />
        </div>
      ) : (
        <EmptyNote>Nada pendente</EmptyNote>
      )}
      {lines.length > 0 ? (
        <ul className="mt-3 space-y-1 text-sm text-ink-muted">
          {lines.map((line) => (
            <li key={line}>{line}</li>
          ))}
        </ul>
      ) : null}
    </li>
  );
}
