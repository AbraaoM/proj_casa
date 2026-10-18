import { CreateKeyForm, RevokeKeyForm } from "@/components/agents/agent-key-forms";
import { createAgentKeyAction, revokeAgentKeyAction } from "@/lib/agent/key-actions";
import { loadAgentKeys } from "@/lib/services/agent-keys";

export const dynamic = "force-dynamic";

const STATUS_COPY = {
  unconfigured: "O banco não está ligado.",
  schema_missing: "As tabelas ainda não existem. Rode npm run db:migrate.",
  error: "Não consegui ler as chaves.",
} as const;

export default async function AgentsPage() {
  const list = await loadAgentKeys();
  const notice = list.status === "ready" ? null : STATUS_COPY[list.status];

  return (
    <main className="mx-auto w-full max-w-3xl px-5 py-8 md:max-w-5xl md:px-10 md:py-12">
      <h1 className="font-display text-3xl leading-tight tracking-tight">Agentes</h1>
      <p className="mt-3 max-w-xl text-sm text-ink-muted">
        Gere uma chave e entregue o segredo ao seu agente. Ela aparece uma vez. Recarregar esta página esconde a chave.
      </p>
      {notice ? <p className="mt-4 max-w-xl text-sm">{notice}</p> : null}

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
                {key.revokedAt ? null : <RevokeKeyForm action={revokeAgentKeyAction} id={key.id} />}
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
