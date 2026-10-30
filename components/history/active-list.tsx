import { attentionPhrase } from "@/lib/domain/attention";
import type { AttentionItem } from "@/lib/domain/types";
import { markerClass, priorityWord } from "@/lib/ui/attention";
import { categoryUnlessTitle } from "@/lib/ui/format";
import { AttentionMark, EmptyNote } from "@/components/ui/attention-mark";
import { ItemActions } from "@/components/one-tap/item-actions";

export function ActiveList({
  items,
  showSubject = false,
  empty = "Nada pendente",
}: {
  items: AttentionItem[];
  showSubject?: boolean;
  empty?: string;
}) {
  if (items.length === 0) return <EmptyNote>{empty}</EmptyNote>;
  return (
    <ul className="mt-4 space-y-4">
      {items.map((item) => (
        <li key={item.id} className={`border-l-2 pl-3 ${markerClass(item.attention)}`}>
          <p className="text-base">
            <AttentionMark attention={item.attention} />
            {item.title}
            {showSubject && item.subject_name ? <span className="text-ink-muted"> · {item.subject_name}</span> : null}
          </p>
          <p className="mt-1 text-sm text-ink-muted">
            {attentionPhrase(item.attention, item.days_until_due, item.next_due_time ?? null)}
            {categoryUnlessTitle(item.category, item.title) ? ` · ${categoryUnlessTitle(item.category, item.title)}` : ""}
            {priorityWord(item.priority) ? ` · ${priorityWord(item.priority)}` : ""}
          </p>
          <ItemActions item={item} />
        </li>
      ))}
    </ul>
  );
}
