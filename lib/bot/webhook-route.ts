import { loadBotRuntime, sameSecret, webhookDeps } from "@/lib/bot/runtime";
import { handleTelegramUpdate } from "@/lib/bot/webhook";
import type { TgUpdate } from "@/lib/bot/telegram";
import { tryGetSql, tryGetSystemSql } from "@/lib/db/client";
import { findFamilyScope, findOriginalFamilyScope } from "@/lib/repositories/families";
import { withTenant } from "@/lib/tenant/scope";

/**
 * Telegram calls this for every update of one family's bot. `family` is a family id, or "original" for the
 * bare /api/telegram/webhook that was registered before families existed. The X-Telegram-Bot-Api-Secret-Token
 * header must match that family's webhook secret (https://core.telegram.org/bots/api#setwebhook).
 * After the check it always answers 200, so Telegram does not resend an update that failed here.
 */
export async function handleWebhookRequest(request: Request, family: string): Promise<Response> {
  const system = tryGetSystemSql();
  if (!system) return Response.json({ ok: false, error: { code: "database_unavailable" } }, { status: 503 });
  const scope = await (family === "original" ? findOriginalFamilyScope(system) : findFamilyScope(system, family)).catch(() => null);
  // Same answer for an unknown family and a wrong secret: nothing to enumerate.
  if (!scope) return Response.json({ ok: false, error: { code: "unauthorized" } }, { status: 401 });

  return withTenant(scope, async () => {
    const sql = tryGetSql()!;
    const loaded = await loadBotRuntime(sql).catch(() => null);
    if (!loaded?.ok) return Response.json({ ok: false, error: { code: "bot_not_configured" } }, { status: 503 });
    const { runtime } = loaded;
    if (!sameSecret(request.headers.get("x-telegram-bot-api-secret-token"), runtime.webhookSecret)) {
      return Response.json({ ok: false, error: { code: "unauthorized" } }, { status: 401 });
    }
    if (!runtime.enabled || !runtime.telegramToken) return Response.json({ ok: true, ignored: "disabled" });

    let update: TgUpdate;
    try {
      update = (await request.json()) as TgUpdate;
    } catch {
      return Response.json({ ok: true, ignored: "bad_json" });
    }
    if (typeof update?.update_id !== "number") return Response.json({ ok: true, ignored: "no_update_id" });
    try {
      await handleTelegramUpdate(update, webhookDeps(sql, runtime));
    } catch (error) {
      console.error("telegram update failed", error instanceof Error ? error.name : "error");
    }
    return Response.json({ ok: true });
  });
}
