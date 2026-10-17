import Link from "next/link";
import { attentionPhrase } from "@/lib/domain/attention";
import type { AttentionItem } from "@/lib/domain/types";
import { markerClass } from "@/lib/ui/attention";

/** A card in a list page (dogs, cars, family, areas). The whole card is the link. */
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
    <li>
      <Link
        href={href}
        className="group block h-full border-t border-line pt-4 transition-colors duration-300 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-accent dark:border-line-dark"
      >
        <div className="flex items-baseline justify-between gap-4">
          <h2 className={`font-display leading-tight tracking-tight ${compact ? "text-2xl" : "text-3xl"} group-hover:text-accent-dark dark:group-hover:text-accent-light`}>
            {title}
          </h2>
          <span aria-hidden="true" className="text-ink-faint transition-transform duration-300 group-hover:translate-x-1">
            →
          </span>
        </div>
        {subtitle ? <p className="mt-1 text-sm text-ink-muted">{subtitle}</p> : null}
        {next ? (
          <p className={`mt-4 border-l-2 pl-3 text-base ${markerClass(next.attention)}`}>
            {next.title}
            <span className="block text-sm text-ink-muted">{attentionPhrase(next.attention, next.days_until_due)}</span>
          </p>
        ) : (
          <p className="mt-4 text-sm text-ink-muted">Nada pendente</p>
        )}
        {lines.length > 0 ? (
          <ul className="mt-3 space-y-1 text-sm text-ink-muted">
            {lines.map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
        ) : null}
      </Link>
    </li>
  );
}
