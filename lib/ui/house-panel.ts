import type { AttentionState } from "@/lib/domain/types";

/** How many house tasks the panel lists before sending the rest to /casa. */
export const HOUSE_PANEL_LIMIT = 4;

type Ranked = { attention: AttentionState };

/**
 * The house card lists what needs a tap today, not the whole checklist.
 * The list arrives already sorted (late first). When something is late or due
 * today, later tasks stay off the card. Otherwise the card still previews the
 * nearest ones, never more than the limit.
 */
export function housePanelSlice<T extends Ranked>(items: T[], limit = HOUSE_PANEL_LIMIT): { shown: T[]; hidden: number } {
  const pressing = items.filter((item) => item.attention === "overdue" || item.attention === "due_today");
  const shown = (pressing.length > 0 ? pressing : items).slice(0, limit);
  return { shown, hidden: Math.max(0, items.length - shown.length) };
}

function countWord(count: number, one: string, many: string): string | null {
  if (count === 0) return null;
  return count === 1 ? `1 ${one}` : `${count} ${many}`;
}

/** "3 atrasadas · 1 vence hoje · 8 a vencer". Empty when there is nothing to count. */
export function housePanelDigest(items: Ranked[]): string {
  const count = (state: AttentionState) => items.filter((item) => item.attention === state).length;
  return [
    countWord(count("overdue"), "atrasada", "atrasadas"),
    countWord(count("due_today"), "vence hoje", "vencem hoje"),
    countWord(count("upcoming"), "a vencer", "a vencer"),
    countWord(count("undated"), "sem data", "sem data"),
  ]
    .filter((part): part is string => part !== null)
    .join(" · ");
}
