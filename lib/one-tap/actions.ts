"use server";

import { revalidatePath } from "next/cache";
import { currentUser } from "@/lib/auth/session";
import { tryGetSql } from "@/lib/db/client";
import { isUuid, todayInTimeZone } from "@/lib/domain/dates";
import { decodeUndo, encodeUndo, type TapKind } from "@/lib/domain/one-tap";
import { tapDone, tapDose, tapPay, tapShift, undoTap, type TapResult } from "@/lib/services/one-tap";
import { clockFor, readSettings } from "@/lib/services/settings";

export type TapState = {
  status: "idle" | "done" | "error";
  message: string | null;
  /** Encoded undo token, for the undo bar. */
  undo: string | null;
  /** Changes on every answer, so the bar restarts its countdown. */
  at: number;
};

const KINDS = new Set<TapKind>(["pay", "dose", "done", "snooze", "skip"]);
const DATE = /^\d{4}-\d{2}-\d{2}$/;

function fail(message: string): TapState {
  return { status: "error", message, undo: null, at: Date.now() };
}

function formatDay(iso: string): string {
  return `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;
}

function successMessage(kind: TapKind, result: Extract<TapResult, { ok: true }>): string {
  if (kind === "pay") return `${result.title}: pago`;
  if (kind === "dose") return `${result.title}: dose registrada`;
  if (kind === "snooze") return `${result.title}: para ${formatDay(result.to as string)}`;
  if (kind === "skip") return `${result.title}: pulado para ${formatDay(result.to as string)}`;
  return `${result.title}: feito`;
}

/** Every one-tap button posts here: kind, the item or bill id, and what the screen showed. */
export async function tapAction(_previous: TapState, formData: FormData): Promise<TapState> {
  if (!(await currentUser())) return fail("Entre de novo para registrar.");
  const kind = formData.get("kind");
  const id = formData.get("id");
  const shownRaw = formData.get("shown");
  const shown = typeof shownRaw === "string" && shownRaw !== "" ? shownRaw : null;
  if (typeof kind !== "string" || !KINDS.has(kind as TapKind) || typeof id !== "string" || !isUuid(id)) {
    return fail("Pedido inválido.");
  }
  const tapKind = kind as TapKind;
  const needsDate = tapKind === "pay" || tapKind === "snooze" || tapKind === "skip";
  if ((needsDate && (!shown || !DATE.test(shown))) || (shown && shown.length > 40)) return fail("Pedido inválido.");

  const sql = tryGetSql();
  if (!sql) return fail("O banco não está ligado.");
  let result: TapResult;
  try {
    const settings = await readSettings(sql);
    const today = todayInTimeZone(settings.timezone);
    if (tapKind === "pay") result = await tapPay(sql, id, shown as string, today);
    else if (tapKind === "done") result = await tapDone(sql, id, shown, today);
    else if (tapKind === "dose") result = await tapDose(sql, id, shown, clockFor(settings));
    else result = await tapShift(sql, id, tapKind, shown as string);
  } catch (error) {
    console.error(error);
    return fail("Não consegui registrar. Tente de novo.");
  }
  if (!result.ok) return fail(result.message);
  revalidatePath("/", "layout");
  return { status: "done", message: successMessage(tapKind, result), undo: encodeUndo(result.undo), at: Date.now() };
}

export type UndoState = { status: "idle" | "done" | "error"; message: string | null; at: number };

/** The undo bar. Voids what the tap recorded; the server checks it again. */
export async function undoAction(_previous: UndoState, formData: FormData): Promise<UndoState> {
  if (!(await currentUser())) return { status: "error", message: "Entre de novo.", at: Date.now() };
  const token = decodeUndo(formData.get("undo"));
  const sql = tryGetSql();
  if (!token || !sql) return { status: "error", message: "Pedido inválido.", at: Date.now() };
  try {
    const today = todayInTimeZone((await readSettings(sql)).timezone);
    const result = await undoTap(sql, token, today);
    if (!result.ok) return { status: "error", message: result.message, at: Date.now() };
  } catch (error) {
    console.error(error);
    return { status: "error", message: "Não consegui desfazer.", at: Date.now() };
  }
  revalidatePath("/", "layout");
  return { status: "done", message: "Desfeito", at: Date.now() };
}
