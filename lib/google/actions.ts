"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { currentUser } from "@/lib/auth/session";
import { tryGetSql } from "@/lib/db/client";
import { isMissingSchema } from "@/lib/db/errors";
import { disconnectGoogleAgenda } from "@/lib/services/google-calendar";

export type AgendaActionState = { ok: boolean; message: string; idle?: boolean };

export async function disconnectGoogleAgendaAction(): Promise<AgendaActionState> {
  const actor = await currentUser();
  if (!actor) redirect("/login");
  const sql = tryGetSql();
  if (!sql) return { ok: false, message: "O banco não está ligado." };
  try {
    const removed = await disconnectGoogleAgenda(sql, actor.id);
    revalidatePath("/agentes");
    revalidatePath("/agenda");
    revalidatePath("/");
    return { ok: removed, message: removed ? "Google Agenda desconectada." : "Sua agenda não estava conectada." };
  } catch (error) {
    if (isMissingSchema(error)) return { ok: false, message: "As tabelas ainda não existem. Rode npm run db:migrate." };
    console.error("google agenda disconnect failed");
    return { ok: false, message: "Não consegui desconectar. Tente de novo." };
  }
}
