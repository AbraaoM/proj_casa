"use server";

import { revalidatePath } from "next/cache";
import { currentUser } from "@/lib/auth/session";
import { tryGetSql } from "@/lib/db/client";
import { isUuid, todayInTimeZone } from "@/lib/domain/dates";
import { readSettings } from "@/lib/services/settings";
import { payFromScreen } from "@/lib/services/finance/screen-pay";

export type PayState = { status: "idle" | "paid" | "error"; message: string | null };

/** The "Paguei" button. Logged-in only; idempotent per bill and due date. */
export async function payBillFromScreen(_previous: PayState, formData: FormData): Promise<PayState> {
  const user = await currentUser();
  if (!user) return { status: "error", message: "Entre de novo para registrar." };
  const billId = formData.get("bill_id");
  const dueDate = formData.get("due_date");
  const amount = formData.get("amount");
  if (typeof billId !== "string" || !isUuid(billId) || typeof dueDate !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(dueDate)) {
    return { status: "error", message: "Pedido inválido." };
  }
  const sql = tryGetSql();
  if (!sql) return { status: "error", message: "O banco não está ligado." };
  try {
    const today = todayInTimeZone((await readSettings(sql)).timezone);
    const paid = await payFromScreen(sql, { billId, dueDate, amount: typeof amount === "string" ? amount : null }, today);
    if (!paid.ok) return { status: "error", message: paid.message };
  } catch (error) {
    console.error(error);
    return { status: "error", message: "Não consegui registrar. Tente de novo." };
  }
  revalidatePath("/");
  revalidatePath("/financas", "layout");
  return { status: "paid", message: "Pago" };
}
