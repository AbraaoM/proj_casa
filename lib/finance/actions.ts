"use server";

import { revalidatePath } from "next/cache";
import { currentUser } from "@/lib/auth/session";
import { tryGetSql } from "@/lib/db/client";
import { isUuid, todayInTimeZone } from "@/lib/domain/dates";
import { isMonth } from "@/lib/domain/finance/dates";
import { getBillByRef } from "@/lib/repositories/finance";
import { updateBill } from "@/lib/services/finance/bills";
import { closeMonth } from "@/lib/services/finance/close";
import { readSettings } from "@/lib/services/settings";

/**
 * The panel's writes: confirm or dismiss a suggested bill, and close a finished month.
 * Anything that is not a suggestion anymore is left alone. Closing twice keeps the first snapshot.
 */
export async function decideSuggestedBill(formData: FormData): Promise<void> {
  const user = await currentUser();
  if (!user) return;
  const id = formData.get("bill_id");
  const decision = formData.get("decision");
  if (typeof id !== "string" || !isUuid(id) || (decision !== "confirm" && decision !== "dismiss")) return;
  const sql = tryGetSql();
  if (!sql) return;
  const bill = await getBillByRef(sql, id);
  if (!bill || bill.status !== "suggested") return;
  await updateBill(sql, bill.id, { status: decision === "confirm" ? "active" : "ended" });
  revalidatePath("/");
  revalidatePath("/financas", "layout");
}

/** One tap on Finanças: freeze a month that has already ended. Doing it twice keeps the first snapshot. */
export async function closeMonthAction(formData: FormData): Promise<void> {
  const user = await currentUser();
  if (!user) return;
  const month = formData.get("month");
  if (typeof month !== "string" || !isMonth(month)) return;
  const sql = tryGetSql();
  if (!sql) return;
  const today = todayInTimeZone((await readSettings(sql)).timezone);
  await closeMonth(sql, month, today, false);
  revalidatePath("/financas", "layout");
}
