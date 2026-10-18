import type { Sql } from "@/lib/db/client";
import { parseDoseBody } from "@/lib/domain/doses";
import { screenPayKey } from "@/lib/domain/finance/screen-pay";
import { parsePay } from "@/lib/domain/finance/validate";
import {
  parseDoneKey,
  shiftTarget,
  tapKey,
  UNDO_GRACE_SECONDS,
  type UndoToken,
} from "@/lib/domain/one-tap";
import type { CareItem, Clock } from "@/lib/domain/types";
import { parseDoneBody } from "@/lib/domain/validate";
import { findBillByItem } from "@/lib/repositories/finance";
import * as eventsRepo from "@/lib/repositories/events";
import * as itemsRepo from "@/lib/repositories/items";
import { recordDose, sqlDoseStore } from "@/lib/services/doses";
import { completeItem, updateEvent } from "@/lib/services/events";
import { getBill, payBill } from "@/lib/services/finance/bills";
import { updateItem } from "@/lib/services/items";

/**
 * The panel's one-tap writes. Every one goes through the same parse and service as
 * the agent API; this file only adds the screen's rules: the tap names what the
 * screen showed, a stale screen does not write, and an undo voids instead of deleting.
 */

export type TapResult =
  | { ok: true; replay: boolean; undo: UndoToken; title: string; to?: string }
  | { ok: false; message: string };

const STALE = "Isto já mudou. Atualize a tela.";

function stale(): TapResult {
  return { ok: false, message: STALE };
}

async function activeItem(sql: Sql, id: string): Promise<CareItem | null> {
  const item = await itemsRepo.getItem(sql, id);
  return item && item.status === "active" ? item : null;
}

/** "Paguei": pays the due date on screen with the expected amount. */
export async function tapPay(sql: Sql, billId: string, due: string, today: string): Promise<TapResult> {
  const bill = await getBill(sql, billId);
  const key = screenPayKey(bill.id, due);
  const existing = await eventsRepo.findEventByExternalKey(sql, key);
  if (existing) return { ok: true, replay: true, undo: { kind: "event", id: existing.id }, title: bill.name };
  if (bill.status !== "active" || bill.kind === "income") return { ok: false, message: "Esta conta não está ativa." };
  if (bill.next_due_date !== due) return stale();
  const parsed = parsePay({ external_key: key });
  if (!parsed.ok) return { ok: false, message: "Não consegui registrar o pagamento." };
  const paid = await payBill(sql, bill.id, parsed.value, today);
  return { ok: true, replay: paid.idempotentReplay, undo: { kind: "event", id: paid.event.id }, title: bill.name };
}

/** "Feito": the item as done today, keyed by the due date on screen. */
export async function tapDone(sql: Sql, itemId: string, due: string | null, today: string): Promise<TapResult> {
  const key = tapKey("done", itemId, due);
  const existing = await eventsRepo.findEventByExternalKey(sql, key);
  const item = await itemsRepo.getItem(sql, itemId);
  if (!item) return stale();
  if (existing) return { ok: true, replay: true, undo: { kind: "event", id: existing.id }, title: item.title };
  if (item.status !== "active" || item.due_date !== due || item.interval_hours) return stale();
  if (await findBillByItem(sql, itemId)) return { ok: false, message: "Use Paguei nesta conta." };
  const parsed = parseDoneBody({ external_key: key });
  if (!parsed.ok) return { ok: false, message: "Não consegui registrar." };
  const done = await completeItem(sql, itemId, parsed.value, today);
  return { ok: true, replay: done.idempotentReplay, undo: { kind: "event", id: done.event.id }, title: item.title };
}

/** "Dose dada": a dose now, keyed by the dose time on screen (a stale tab replays). */
export async function tapDose(sql: Sql, itemId: string, shown: string | null, clock: Clock): Promise<TapResult> {
  const item = await activeItem(sql, itemId);
  if (!item || !item.interval_hours) return stale();
  const parsed = parseDoseBody({ external_key: tapKey("dose", itemId, shown) });
  if (!parsed.ok) return { ok: false, message: "Não consegui registrar a dose." };
  const dose = await recordDose(sqlDoseStore(sql), itemId, parsed.value, clock);
  return { ok: true, replay: dose.idempotentReplay, undo: { kind: "event", id: dose.event.id }, title: item.title };
}

/** "+1 dia" (snooze) or "Ignorar" (skip to the next cycle), from the due date on screen. */
export async function tapShift(sql: Sql, itemId: string, kind: "snooze" | "skip", from: string): Promise<TapResult> {
  const item = await activeItem(sql, itemId);
  if (!item || item.interval_hours) return stale();
  if (await findBillByItem(sql, itemId)) return { ok: false, message: "Contas mudam pelo Paguei." };
  const to = shiftTarget(item, kind, from);
  if (!to) return { ok: false, message: "Este item não se repete." };
  const undo: UndoToken = { kind: "shift", id: itemId, from, to };
  if (item.due_date === to) return { ok: true, replay: true, undo, title: item.title, to };
  if (item.due_date !== from) return stale();
  await updateItem(sql, itemId, { due_date: to });
  return { ok: true, replay: false, undo, title: item.title, to };
}

export type UndoResult = { ok: true; replay: boolean } | { ok: false; message: string };

/**
 * Undoes a tap. An event is voided (never deleted): a bill goes back to its due
 * date, a dose schedule is recomputed, and a done item gets back the due date its key
 * recorded. A shift moves the date back. Nothing changes if the item moved since.
 */
export async function undoTap(sql: Sql, token: UndoToken, today: string, now = new Date()): Promise<UndoResult> {
  if (token.kind === "shift") {
    const item = await itemsRepo.getItem(sql, token.id);
    if (!item) return { ok: false, message: STALE };
    if (item.due_date === token.from) return { ok: true, replay: true };
    if (item.due_date !== token.to) return { ok: false, message: STALE };
    await updateItem(sql, token.id, { due_date: token.from });
    return { ok: true, replay: false };
  }

  const event = await eventsRepo.getEvent(sql, token.id);
  if (!event || !event.external_key?.startsWith("ui:")) return { ok: false, message: "Só dá para desfazer o que foi tocado aqui." };
  if (event.voided_at !== null) return { ok: true, replay: true };
  if (now.getTime() - Date.parse(event.created_at) > UNDO_GRACE_SECONDS * 1000) {
    return { ok: false, message: "Passou o tempo de desfazer. Peça ao seu agente para corrigir." };
  }

  const done = parseDoneKey(event.external_key);
  const before = done ? await itemsRepo.getItem(sql, done.itemId) : null;
  await updateEvent(sql, event.id, { voided: true }, today);

  // A plain "Feito" (a bill is handled by updateEvent): the due date comes back from the key.
  if (done && before && before.last_done_on === event.done_on && !(await findBillByItem(sql, done.itemId))) {
    const previous = await eventsRepo.latestLiveItemEvent(sql, done.itemId, event.id);
    await itemsRepo.updateItem(sql, done.itemId, {
      due_date: done.due,
      status: "active",
      last_done_on: previous?.done_on ?? null,
    });
  }
  return { ok: true, replay: false };
}
