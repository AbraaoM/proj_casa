import { timingSafeEqual, createHash } from "node:crypto";
import { loadBotRuntime, type BotRuntime } from "@/lib/bot/config";
import { createModel, type ModelFactories, SDK_FACTORIES } from "@/lib/bot/provider";
import { telegramClient, type FetchLike } from "@/lib/bot/telegram";
import type { ModelResult, WebhookDeps } from "@/lib/bot/webhook";
import type { Sql } from "@/lib/db/client";
import { todayInTimeZone } from "@/lib/domain/dates";
import { householdClock } from "@/lib/services/settings";

export function sameSecret(presented: string | null, expected: string | null): boolean {
  if (!presented || !expected) return false;
  const a = createHash("sha256").update(presented).digest();
  const b = createHash("sha256").update(expected).digest();
  return timingSafeEqual(a, b);
}

export async function householdContext(sql: Sql) {
  const clock = await householdClock(sql);
  return { sql, clock, today: todayInTimeZone(clock.timeZone) };
}

export function webhookDeps(sql: Sql, runtime: BotRuntime, options: { fetch?: FetchLike; factories?: ModelFactories } = {}): WebhookDeps {
  return {
    sql,
    telegram: telegramClient(runtime.telegramToken ?? "", options.fetch),
    botUsername: runtime.botUsername,
    async model(): Promise<ModelResult> {
      if (!runtime.ai.ok) return { ok: false, message: `O bot ainda não está pronto: ${runtime.ai.message} Quem administra a Casa ajusta em Agentes → Bot.` };
      try {
        return { ok: true, model: await createModel(runtime.ai.value, options.factories ?? SDK_FACTORIES) };
      } catch {
        return { ok: false, message: "Não consegui abrir o provedor de IA configurado." };
      }
    },
    context: () => householdContext(sql),
  };
}

export { loadBotRuntime };
