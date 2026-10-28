import Link from "next/link";
import { AgendaConnectLink } from "@/components/agenda/connect-link";
import { CreateKeyForm, RevokeKeyForm } from "@/components/agents/agent-key-forms";
import { BotActionButton, ConnectTelegramButton } from "@/components/agents/bot-forms";
import { connectTelegramAction, disconnectTelegramAction } from "@/lib/bot/actions";
import { canManageAccounts } from "@/lib/auth/policy";
import { createAgentKeyAction, revokeAgentKeyAction } from "@/lib/agent/key-actions";
import { currentUser } from "@/lib/auth/session";
import { tryGetSql } from "@/lib/db/client";
import { disconnectGoogleAgendaAction } from "@/lib/google/actions";
import { loadAgentKeys } from "@/lib/services/agent-keys";
import { loadAgendaLink, type AgendaNotice } from "@/lib/services/google-calendar";
import { loadTelegramStatus } from "@/lib/services/telegram-status";

export const dynamic = "force-dynamic";

const STATUS_COPY = {
  unconfigured: "O banco não está ligado.",
  schema_missing: "As tabelas ainda não existem. Rode npm run db:migrate.",
  error: "Não consegui ler as chaves.",
} as const;

const AGENDA_NOTICE: Partial<Record<AgendaNotice, string>> = {
  unconfigured: "Falta GOOGLE_CLIENT_ID e GOOGLE_CLIENT_SECRET no servidor.",
  secret: "Falta CASA_SECRET_KEY para guardar a conexão.",
  denied: "A conexão com o Google foi cancelada.",
  expired: "O código expirou. Toque em Conectar de novo.",
  failed: "Não consegui conectar a agenda.",
};

type Props = { searchParams: Promise<{ agenda?: string }> };

export default async function AgentsPage({ searchParams }: Props) {
  const { agenda: noticeKey } = await searchParams;
  const [list, actor] = await Promise.all([loadAgentKeys(), currentUser()]);
  const telegram = await loadTelegramStatus(actor);
  const sql = tryGetSql();
  const agenda = actor && sql ? await loadAgendaLink(sql, actor.id).catch(() => null) : null;
  const canRevoke = (ownerId: string | null) => actor?.role === "admin" || (actor !== null && ownerId === actor.id);
  const notice = list.status === "ready" ? null : STATUS_COPY[list.status];
  const agendaNotice = noticeKey ? AGENDA_NOTICE[noticeKey as AgendaNotice] : null;

  return (
    <main className="mx-auto w-full max-w-3xl px-5 py-8 md:max-w-5xl md:px-10 md:py-12">
      <h1 className="font-display text-3xl leading-tight tracking-tight">Agentes</h1>
      <p className="mt-3 max-w-xl text-sm text-ink-muted">
        Gere uma chave e entregue o segredo ao seu agente. A chave é sua: o que o agente fizer fica registrado no seu nome e no nome que você der a ele. Ela aparece uma vez; recarregar esta página esconde a chave.
      </p>
      {notice ? <p className="mt-4 max-w-xl text-sm">{notice}</p> : null}
      {agendaNotice ? <p className="mt-4 max-w-xl text-sm">{agendaNotice}</p> : null}

      <section className="mt-12 max-w-md border-t border-line pt-4 dark:border-line-dark">
        <h2 className="text-lg">Google Agenda</h2>
        {agenda?.schema === "missing" ? (
          <p className="mt-3 text-sm text-ink-muted">As tabelas ainda não existem. Rode npm run db:migrate.</p>
        ) : agenda?.connected ? (
          <>
            <p className="mt-3 text-sm text-ink-muted">
              Conectada{agenda.email ? ` como ${agenda.email}` : ""}. Os próximos dias aparecem em Agenda.
            </p>
            <div className="mt-4">
              <BotActionButton action={disconnectGoogleAgendaAction} label="Desconectar Google Agenda" pendingLabel="Desconectando…" quiet />
            </div>
          </>
        ) : (
          <>
            <p className="mt-3 text-sm text-ink-muted">
              {agenda?.configured
                ? "Um toque pede permissão ao Google. A Casa lê e cria compromissos na sua agenda. O token fica cifrado."
                : "O servidor ainda não tem o cliente OAuth do Google."}
            </p>
            <div className="mt-4">
              <AgendaConnectLink disabled={!agenda?.configured} />
            </div>
          </>
        )}
        <p className="mt-4 text-sm">
          <Link href="/agenda" className="underline underline-offset-4">
            Ver a agenda
          </Link>
        </p>
      </section>

      <section className="mt-12 max-w-md border-t border-line pt-4 dark:border-line-dark">
        <h2 className="text-lg">Telegram</h2>
        {telegram.linked ? (
          <>
            <p className="mt-3 text-sm text-ink-muted">
              Conectado{telegram.linked.telegramName ? ` como ${telegram.linked.telegramName}` : ""}. Converse com seu agente no privado ou no grupo da família.
            </p>
            <div className="mt-4">
              <BotActionButton action={disconnectTelegramAction} label="Desconectar Telegram" pendingLabel="Desconectando…" quiet />
            </div>
          </>
        ) : (
          <>
            <p className="mt-3 text-sm text-ink-muted">
              {telegram.ready
                ? "Um toque abre o bot no Telegram com um código seu. Depois disso o bot sabe quem é você, no privado e no grupo."
                : "O bot ainda não está ligado."}
            </p>
            <div className="mt-4">
              <ConnectTelegramButton action={connectTelegramAction} disabled={!telegram.ready} />
            </div>
          </>
        )}
        {canManageAccounts(actor) ? (
          <p className="mt-4 text-sm">
            <Link href="/agentes/bot" className="underline underline-offset-4">
              Configurar o bot
            </Link>
          </p>
        ) : null}
      </section>

      <section className="mt-12 max-w-md border-t border-line pt-4 dark:border-line-dark">
        <h2 className="text-lg">Nova chave</h2>
        <CreateKeyForm action={createAgentKeyAction} />
      </section>

      <section className="mt-12 border-t border-line pt-4 dark:border-line-dark">
        <h2 className="text-lg">Chaves</h2>
        {list.keys.length === 0 ? (
          <p className="mt-4 text-sm text-ink-muted">Nenhuma chave.</p>
        ) : (
          <ul className="mt-4">
            {list.keys.map((key) => (
              <li key={key.id} className="border-b border-line py-5 dark:border-line-dark">
                <p className="text-base">
                  {key.label}
                  {key.revokedAt ? <span className="text-ink-muted"> · revogada</span> : null}
                </p>
                <p className="mt-1 break-all text-sm text-ink-muted">
                  {key.prefix}…
                  {" · "}
                  {key.createdBy ?? "conta removida"}
                  {" · "}
                  {formatWhen(key.createdAt)}
                </p>
                {key.revokedAt || !canRevoke(key.createdById) ? null : <RevokeKeyForm action={revokeAgentKeyAction} id={key.id} />}
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}

function formatWhen(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "America/Sao_Paulo",
  }).format(date);
}
