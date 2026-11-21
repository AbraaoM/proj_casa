import { loadBotRuntime, sameSecret } from "@/lib/bot/runtime";
import { tryGetSql, tryGetSystemSql } from "@/lib/db/client";
import { listBotFamilyScopes } from "@/lib/repositories/families";
import { withTenant } from "@/lib/tenant/scope";

/**
 * Runs a daily Telegram job once per family that has its bot on (trial still running).
 * One family failing never stops the others. The cron secret, when set, is required.
 */
export async function runForEachBotFamily(
  request: Request,
  job: (input: { sql: NonNullable<ReturnType<typeof tryGetSql>>; telegramToken: string }) => Promise<{ sent: number; failed: number }>,
): Promise<Response> {
  const cronSecret = process.env.CRON_SECRET?.trim();
  if (cronSecret && !sameSecret(request.headers.get("authorization"), `Bearer ${cronSecret}`)) {
    return Response.json({ ok: false, error: { code: "unauthorized" } }, { status: 401 });
  }
  const system = tryGetSystemSql();
  if (!system) return Response.json({ ok: false, error: { code: "database_unavailable" } }, { status: 503 });

  let scopes;
  try {
    scopes = await listBotFamilyScopes(system);
  } catch {
    return Response.json({ ok: false, error: { code: "database_unavailable" } }, { status: 503 });
  }
  let sent = 0;
  let failed = 0;
  let families = 0;
  for (const scope of scopes) {
    try {
      await withTenant(scope, async () => {
        const sql = tryGetSql()!;
        const loaded = await loadBotRuntime(sql).catch(() => null);
        if (!loaded?.ok || !loaded.runtime.enabled || !loaded.runtime.telegramToken) return;
        const result = await job({ sql, telegramToken: loaded.runtime.telegramToken });
        families += 1;
        sent += result.sent;
        failed += result.failed;
      });
    } catch (error) {
      failed += 1;
      console.error("bot job failed for one family", error instanceof Error ? error.name : "error");
    }
  }
  if (families === 0 && failed === 0) return Response.json({ ok: true, sent: 0, skipped: "bot_disabled" });
  return Response.json({ ok: true, families, sent, failed });
}
