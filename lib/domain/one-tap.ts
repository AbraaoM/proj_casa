import { addDays } from "@/lib/domain/dates";
import { addMonths } from "@/lib/domain/finance/dates";
import type { CareItem } from "@/lib/domain/types";

/**
 * One-tap actions: the only way the panel writes. Each tap carries what the screen
 * showed (the due date or dose time), so a second tap or a stale tab replays instead
 * of writing twice, and every tap can be undone for a few seconds by voiding.
 */

export type TapKind = "pay" | "dose" | "done" | "snooze" | "skip";

export const UNDO_SECONDS = 5;
/** The server accepts an undo a little longer than the bar shows (slow networks). */
export const UNDO_GRACE_SECONDS = 120;

/** Bill data a payment button needs. */
export type TapBill = { id: string; kind: string; amount_cents: number; amount_varies: boolean; next_due_date: string };

export type TapAction = { kind: TapKind; label: string; primary: boolean };

/** Idempotency key of a tap that records an event. "none" stands for no due date. */
export function tapKey(kind: "done" | "dose", itemId: string, shown: string | null): string {
  return `ui:${kind}:${itemId}:${shown ?? "none"}`;
}

/** Reads back a done key: the due date the item had when it was tapped. */
export function parseDoneKey(key: string | null): { itemId: string; due: string | null } | null {
  const match = key?.match(/^ui:done:([0-9a-f-]{36}):(\d{4}-\d{2}-\d{2}|none)$/);
  if (!match) return null;
  return { itemId: match[1] as string, due: match[2] === "none" ? null : (match[2] as string) };
}

function money(cents: number): string {
  return (cents / 100).toLocaleString("pt-BR", { maximumFractionDigits: 0 });
}

/** A variable bill is paid with its expected amount, shown on the button; the agent corrects it later. */
export function payLabel(bill: Pick<TapBill, "amount_cents" | "amount_varies">): string {
  return bill.amount_varies ? `Paguei ~${money(bill.amount_cents)}` : "Paguei";
}

export function isRecurring(item: Pick<CareItem, "interval_days" | "interval_months">): boolean {
  return Boolean((item.interval_days && item.interval_days > 0) || (item.interval_months && item.interval_months > 0));
}

/** The buttons an item gets, primary first. Income bills and items without a due date get fewer. */
export function actionsFor(
  item: Pick<CareItem, "status" | "due_date" | "interval_days" | "interval_months" | "interval_hours">,
  bill: TapBill | null,
): TapAction[] {
  if (item.status !== "active") return [];
  if (bill) {
    return bill.kind === "income" ? [] : [{ kind: "pay", label: payLabel(bill), primary: true }];
  }
  if (item.interval_hours) return [{ kind: "dose", label: "Dose dada", primary: true }];
  const actions: TapAction[] = [];
  if (item.due_date) actions.push({ kind: "snooze", label: "+1 dia", primary: false });
  if (item.due_date && isRecurring(item)) actions.push({ kind: "skip", label: "Ignorar", primary: false });
  actions.push({ kind: "done", label: "Feito", primary: true });
  return actions;
}

/** Where snooze (+1 day) or skip (next cycle) moves the due date shown on screen. */
export function shiftTarget(
  item: Pick<CareItem, "interval_days" | "interval_months">,
  kind: "snooze" | "skip",
  from: string,
): string | null {
  if (kind === "snooze") return addDays(from, 1);
  if (item.interval_days && item.interval_days > 0) return addDays(from, item.interval_days);
  if (item.interval_months && item.interval_months > 0) return addMonths(from, item.interval_months);
  return null;
}

/** What the undo bar sends back. Checked again on the server; never trusted alone. */
export type UndoToken =
  | { kind: "event"; id: string }
  | { kind: "shift"; id: string; from: string; to: string };

export function encodeUndo(token: UndoToken): string {
  return token.kind === "event" ? `event:${token.id}` : `shift:${token.id}:${token.from}:${token.to}`;
}

export function decodeUndo(value: unknown): UndoToken | null {
  if (typeof value !== "string") return null;
  const event = value.match(/^event:([0-9a-f-]{36})$/);
  if (event) return { kind: "event", id: event[1] as string };
  const shift = value.match(/^shift:([0-9a-f-]{36}):(\d{4}-\d{2}-\d{2}):(\d{4}-\d{2}-\d{2})$/);
  if (shift) return { kind: "shift", id: shift[1] as string, from: shift[2] as string, to: shift[3] as string };
  return null;
}
