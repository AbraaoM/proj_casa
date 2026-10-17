"use server";

import { revalidatePath } from "next/cache";
import { currentUser } from "@/lib/auth/session";
import { tryGetSql } from "@/lib/db/client";
import { isUuid } from "@/lib/domain/dates";
import { getBillByRef } from "@/lib/repositories/finance";
import { updateBill } from "@/lib/services/finance/bills";

/**
 * The panel's only write: confirm (active) or dismiss (ended) a bill James suggested.
 * Anything that is not a suggestion anymore is left alone.
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
