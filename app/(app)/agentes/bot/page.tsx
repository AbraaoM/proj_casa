import Link from "next/link";
import { BotActionButton, BotSettingsForm } from "@/components/agents/bot-forms";
import { registerWebhookAction, rotateSecretAction, saveBotSettingsAction, testBotAction, toggleBotAction } from "@/lib/bot/actions";
import { AI_PROVIDERS, PROVIDER_LABELS, PROVIDER_NOTES } from "@/lib/bot/provider";
import { canManageAccounts } from "@/lib/auth/policy";
import { currentUser } from "@/lib/auth/session";
import { tryGetSql } from "@/lib/db/client";
import { isMissingSchema } from "@/lib/db/errors";
import { listBotLog, readBotConfig, type BotConfigView, type BotLogEntry } from "@/lib/repositories/bot";
import { GENERATE_KEY_COMMAND, MASTER_KEY_ENV, maskSecret, readMasterKey } from "@/lib/secrets/crypto";

export const dynamic = "force-dynamic";

const ACTION_COPY: Record<string, string> = {
  save: "salvou",
  enable: "ligou o bot",
  disable: "desligou o bot",
  rotate_webhook_secret: "trocou o segredo do webhook",
  register_webhook: "registrou o webhook",
  register_webhook_failed: "tentou registrar o webhook",
  test_ok: "testou: ok",
  test_failed: "testou: falhou",
};

const FIELD_COPY: Record<string, string> = {
  ai_provider: "provedor",
  ai_model: "modelo",
  ai_base_url: "URL base",
  ai_api_key: "chave de IA",
  telegram_token: "token do bot",
  webhook_secret: "segredo",
  webhook_url: "endereço",
  enabled: "ligado",
};

export default async function BotSettingsPage() {
  const actor = await currentUser();
  const shell = (children: React.ReactNode) => (
    <main className="mx-auto w-full max-w-3xl px-5 py-8 md:max-w-5xl md:px-10 md:py-12">
      <p className="text-sm text-ink-muted">
        <Link href="/agentes" className="underline-offset-4 hover:underline">
          Agentes
        </Link>
      </p>
      <h1 className="mt-2 font-display text-3xl leading-tight tracking-tight">Bot do Telegram</h1>
      {children}
    </main>
  );

  if (!canManageAccounts(actor)) return shell(<p className="mt-4 max-w-xl text-sm">Só a conta master configura o bot.</p>);

  const sql = tryGetSql();
  if (!sql) return shell(<p className="mt-4 text-sm">O banco não está ligado.</p>);
  let view: BotConfigView;
  let log: BotLogEntry[];
  try {
    [{ view }, log] = await Promise.all([readBotConfig(sql), listBotLog(sql, 8)]);
  } catch (error) {
    return shell(<p className="mt-4 text-sm">{isMissingSchema(error) ? "As tabelas ainda não existem. Rode npm run db:migrate." : "Não consegui ler a configuração."}</p>);
  }

  const master = readMasterKey();
  const ready = Boolean(view.telegramTokenLast4 && view.aiKeyLast4 && master.ok);
  const providers = AI_PROVIDERS.map((value) => ({ value, label: PROVIDER_LABELS[value], note: PROVIDER_NOTES[value] ?? null }));

  return shell(
    <>
      <p className="mt-3 max-w-xl text-sm text-ink-muted">
        As chaves ficam no banco, cifradas com a {MASTER_KEY_ENV}. Esta tela nunca mostra uma chave salva, só os 4 últimos caracteres.
      </p>

      {master.ok ? null : (
        <section className="mt-8 max-w-xl rounded-md border border-accent p-4">
          <h2 className="text-base">{master.reason === "missing" ? `Falta a ${MASTER_KEY_ENV}` : `A ${MASTER_KEY_ENV} não é válida`}</h2>
          <p className="mt-2 text-sm text-ink-muted">
            Gere uma chave de 32 bytes e coloque em {MASTER_KEY_ENV} nas variáveis de ambiente do deploy (é a única). Sem ela, esta tela não salva chaves.
          </p>
          <code className="mt-3 block break-all rounded bg-black/5 p-3 text-xs dark:bg-white/10">{GENERATE_KEY_COMMAND}</code>
        </section>
      )}

      <section className="mt-10 max-w-md border-t border-line pt-4 dark:border-line-dark">
        <h2 className="text-lg">Estado</h2>
        <dl className="mt-3 space-y-1 text-sm">
          <Row label="Bot">{view.enabled ? "ligado" : "desligado"}</Row>
          <Row label="Telegram">{view.botUsername ? `@${view.botUsername}` : "não testado"}</Row>
          <Row label="Webhook">{view.webhookRegisteredAt ? `registrado ${formatWhen(view.webhookRegisteredAt)}` : "não registrado"}</Row>
          <Row label="Segredo">{maskSecret(view.webhookSecretLast4) ?? "não criado"}</Row>
        </dl>
        <div className="mt-5 flex flex-col gap-4">
          <BotActionButton
            action={toggleBotAction}
            fields={{ enabled: view.enabled ? "0" : "1" }}
            label={view.enabled ? "Desligar bot" : "Ligar bot"}
            pendingLabel="Salvando…"
            quiet={view.enabled}
            disabled={!view.enabled && !ready}
          />
          <BotActionButton action={registerWebhookAction} label="Registrar webhook" pendingLabel="Registrando…" quiet disabled={!master.ok || !view.telegramTokenLast4} />
          <BotActionButton action={testBotAction} label="Testar" pendingLabel="Testando…" quiet disabled={!master.ok} />
          <BotActionButton action={rotateSecretAction} label="Trocar segredo do webhook" pendingLabel="Trocando…" quiet disabled={!master.ok} />
        </div>
      </section>

      <section className="mt-10 max-w-md border-t border-line pt-4 dark:border-line-dark">
        <h2 className="text-lg">Configuração</h2>
        <BotSettingsForm
          action={saveBotSettingsAction}
          providers={providers}
          provider={view.aiProvider}
          model={view.aiModel}
          baseUrl={view.aiBaseUrl}
          aiKeyMasked={maskSecret(view.aiKeyLast4)}
          tokenMasked={maskSecret(view.telegramTokenLast4)}
          secretsAllowed={master.ok}
        />
      </section>

      <section className="mt-10 border-t border-line pt-4 dark:border-line-dark">
        <h2 className="text-lg">Mudanças</h2>
        {log.length === 0 ? (
          <p className="mt-3 text-sm text-ink-muted">Nenhuma mudança ainda.</p>
        ) : (
          <ul className="mt-3">
            {log.map((entry, index) => (
              <li key={`${entry.at}-${index}`} className="border-b border-line py-3 text-sm dark:border-line-dark">
                {entry.username ?? "conta removida"} {ACTION_COPY[entry.action] ?? entry.action}
                {entry.fields.length > 0 ? `: ${entry.fields.map((field) => FIELD_COPY[field] ?? field).join(", ")}` : ""}
                <span className="text-ink-muted"> · {formatWhen(entry.at)}</span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </>,
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex justify-between gap-4">
      <dt className="text-ink-muted">{label}</dt>
      <dd className="text-right">{children}</dd>
    </div>
  );
}

function formatWhen(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short", timeZone: "America/Sao_Paulo" }).format(date);
}
