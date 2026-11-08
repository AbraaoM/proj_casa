"use server";

import { revalidatePath } from "next/cache";
import { withCaller } from "@/lib/agent/actor";
import { currentUser } from "@/lib/auth/session";
import { tryGetSql } from "@/lib/db/client";
import { isUuid, todayInTimeZone } from "@/lib/domain/dates";
import { buyShopping, generateShopping } from "@/lib/services/food";
import { readSettings } from "@/lib/services/settings";

/** One tap: the line was bought. Stock does not change; the agent does that when asked. */
export async function buyFoodAction(formData: FormData): Promise<void> {
  const user = await currentUser();
  if (!user) return;
  const id = formData.get("id");
  if (typeof id !== "string" || !isUuid(id)) return;
  const sql = tryGetSql();
  if (!sql) return;
  const panel = { userId: user.id, username: user.username, keyId: null, agentName: null };
  await withCaller(panel, "panel", async () => {
    await buyShopping(sql, id, false);
  });
  revalidatePath("/comida");
}

/** One tap: put everything at or below its minimum on the open shopping list. */
export async function fillShoppingAction(): Promise<void> {
  const user = await currentUser();
  if (!user) return;
  const sql = tryGetSql();
  if (!sql) return;
  const today = todayInTimeZone((await readSettings(sql)).timezone);
  const panel = { userId: user.id, username: user.username, keyId: null, agentName: null };
  await withCaller(panel, "panel", async () => {
    await generateShopping(sql, today);
  });
  revalidatePath("/comida");
}
