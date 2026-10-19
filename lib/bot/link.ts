import type { AccountUser } from "@/lib/auth/types";
import type { Sql } from "@/lib/db/client";
import { createLinkCode, LINK_CODE_MINUTES, readBotConfig } from "@/lib/repositories/bot";

export function telegramStartUrl(botUsername: string, code: string): string {
  return `https://t.me/${encodeURIComponent(botUsername)}?start=${encodeURIComponent(code)}`;
}

export async function telegramLinkStart(sql: Sql, actor: AccountUser): Promise<{ ok: boolean; message: string; url?: string }> {
  const { view } = await readBotConfig(sql);
  if (!view.enabled || !view.botUsername) {
    return { ok: false, message: "O bot do Telegram ainda não está ligado. Quem administra a Casa liga em Agentes → Bot." };
  }
  const code = await createLinkCode(sql, actor.id);
  return {
    ok: true,
    message: `Abrindo o Telegram. Toque em Iniciar lá. O código vale ${LINK_CODE_MINUTES} minutos e uma vez só.`,
    url: telegramStartUrl(view.botUsername, code),
  };
}
