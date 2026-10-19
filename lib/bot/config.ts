import type { Sql } from "@/lib/db/client";
import { checkProvider, type ProviderCheck } from "@/lib/bot/provider";
import { readBotConfig, type BotConfigView } from "@/lib/repositories/bot";
import { decryptSecret, readMasterKey } from "@/lib/secrets/crypto";

/** What the bot needs at run time, decrypted on the server only. */
export type BotRuntime = {
  enabled: boolean;
  botUsername: string | null;
  telegramToken: string | null;
  webhookSecret: string | null;
  ai: ProviderCheck;
  view: BotConfigView;
};

export type RuntimeLoad = { ok: true; runtime: BotRuntime } | { ok: false; reason: "master_key_missing" | "master_key_invalid" | "decrypt_failed" };

export async function loadBotRuntime(sql: Sql, env: Record<string, string | undefined> = process.env): Promise<RuntimeLoad> {
  const master = readMasterKey(env);
  if (!master.ok) return { ok: false, reason: master.reason === "missing" ? "master_key_missing" : "master_key_invalid" };
  const { view, secrets } = await readBotConfig(sql);
  const open = (value: string | null) => (value ? decryptSecret(value, master.key) : null);
  try {
    const aiKey = open(secrets.aiKeyEnc);
    return {
      ok: true,
      runtime: {
        enabled: view.enabled,
        botUsername: view.botUsername,
        telegramToken: open(secrets.telegramTokenEnc),
        webhookSecret: open(secrets.webhookSecretEnc),
        ai: checkProvider({ provider: view.aiProvider, model: view.aiModel, baseUrl: view.aiBaseUrl, apiKey: aiKey }),
        view,
      },
    };
  } catch {
    // A different CASA_SECRET_KEY than the one used to save: the secrets must be pasted again.
    return { ok: false, reason: "decrypt_failed" };
  }
}
