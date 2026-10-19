import type { AccountUser } from "@/lib/auth/types";
import { tryGetSql } from "@/lib/db/client";
import { findLinkByUser, readBotConfig } from "@/lib/repositories/bot";

export type TelegramStatus = { ready: boolean; linked: { telegramName: string | null; linkedAt: string } | null };

/** For the Agentes page: is the bot on, and is this person's Telegram linked. Never throws. */
export async function loadTelegramStatus(actor: AccountUser | null): Promise<TelegramStatus> {
  const sql = tryGetSql();
  if (!sql || !actor) return { ready: false, linked: null };
  try {
    const [{ view }, linked] = await Promise.all([readBotConfig(sql), findLinkByUser(sql, actor.id)]);
    return { ready: view.enabled && Boolean(view.botUsername), linked };
  } catch {
    return { ready: false, linked: null };
  }
}
