"use client";

import { useState, useTransition } from "react";
import { Check, Copy, Link2 } from "lucide-react";
import { createInviteAction, revokeInviteAction, type InviteActionState } from "@/lib/auth/actions";

export type InviteRow = { id: string; status: "open" | "accepted" | "revoked" | "expired"; expiresAt: string; createdAt: string };

const STATUS: Record<InviteRow["status"], string> = {
  open: "aberto",
  accepted: "usado",
  revoked: "cancelado",
  expired: "vencido",
};

const button =
  "inline-flex min-h-11 items-center gap-2 rounded-md bg-accent px-4 py-3 text-sm font-medium text-soft-black transition-colors duration-300 hover:bg-accent-light focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:opacity-60";
const ghost =
  "inline-flex min-h-11 items-center gap-2 rounded-md border border-line px-4 py-3 text-sm font-medium transition-colors duration-300 hover:border-black focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent dark:border-line-dark dark:hover:border-white";

/** One tap creates a single-use link. The link is shown once, right here, and copied with one more tap. */
export function InviteManager({ invites }: { invites: InviteRow[] }) {
  const [state, setState] = useState<InviteActionState | null>(null);
  const [copied, setCopied] = useState(false);
  const [pending, start] = useTransition();

  function create() {
    setCopied(false);
    start(async () => setState(await createInviteAction()));
  }

  async function copy(link: string) {
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  }

  return (
    <div>
      <button type="button" onClick={create} disabled={pending} className={`${button} mt-4`}>
        <Link2 aria-hidden className="h-4 w-4" strokeWidth={1.75} />
        {pending ? "Criando…" : "Gerar link de convite"}
      </button>
      {state ? (
        <div className="mt-4" aria-live="polite">
          <p className={state.ok ? "text-sm text-accent" : "text-sm"}>{state.message}</p>
          {state.link ? (
            <div className="mt-3 flex flex-col gap-3 sm:flex-row sm:items-center">
              <code className="min-w-0 flex-1 break-all rounded-md border border-line px-3 py-3 text-xs dark:border-line-dark">{state.link}</code>
              <button type="button" onClick={() => copy(state.link!)} className={ghost}>
                {copied ? <Check aria-hidden className="h-4 w-4" strokeWidth={1.75} /> : <Copy aria-hidden className="h-4 w-4" strokeWidth={1.75} />}
                {copied ? "Copiado" : "Copiar link"}
              </button>
            </div>
          ) : null}
        </div>
      ) : null}
      {invites.length > 0 ? (
        <ul className="mt-6">
          {invites.map((invite) => (
            <li key={invite.id} className="flex items-center justify-between gap-4 border-b border-line py-3 dark:border-line-dark">
              <p className="text-sm">
                Convite de {new Date(invite.createdAt).toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" })}
                <span className="text-ink-muted"> · {STATUS[invite.status]}</span>
                {invite.status === "open" ? (
                  <span className="text-ink-muted"> · vale até {new Date(invite.expiresAt).toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" })}</span>
                ) : null}
              </p>
              {invite.status === "open" ? (
                <form action={revokeInviteAction}>
                  <input type="hidden" name="id" value={invite.id} />
                  <button type="submit" className={ghost}>
                    Cancelar
                  </button>
                </form>
              ) : null}
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
