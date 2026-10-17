"use client";

import { useEffect, useId, useRef, useState } from "react";
import { useActionState } from "react";
import { idleKeyAction, type KeyActionState } from "@/lib/agent/keys";

type Action = (state: KeyActionState, formData: FormData) => Promise<KeyActionState>;

const fieldClass =
  "w-full rounded-md border border-line bg-transparent px-3 py-3 text-base outline-none transition-colors duration-300 placeholder:text-ink-faint focus:border-accent dark:border-line-dark";

const buttonClass =
  "min-h-11 rounded-md bg-accent px-4 py-3 text-sm font-medium text-soft-black transition-colors duration-300 hover:bg-accent-light focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:opacity-60";

const textButtonClass =
  "text-sm text-ink-muted transition-colors duration-300 hover:text-black focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent dark:hover:text-white";

export function CreateKeyForm({ action }: { action: Action }) {
  const [state, formAction, pending] = useActionState(action, idleKeyAction);
  const [copiedToken, setCopiedToken] = useState<string | null>(null);
  const [failedToken, setFailedToken] = useState<string | null>(null);
  const id = useId();
  const secretRef = useRef<HTMLInputElement>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const copied = Boolean(state.token) && copiedToken === state.token;
  const copyFailed = Boolean(state.token) && failedToken === state.token;

  useEffect(() => {
    if (!state.token) return;
    secretRef.current?.focus();
    formRef.current?.reset();
  }, [state.token]);

  async function copyToken() {
    if (!state.token) return;
    try {
      await navigator.clipboard.writeText(state.token);
      setCopiedToken(state.token);
      setFailedToken(null);
    } catch {
      setCopiedToken(null);
      setFailedToken(state.token);
      secretRef.current?.select();
    }
  }

  return (
    <form ref={formRef} action={formAction} className="mt-4 space-y-4">
      {state.token ? (
        <div className="space-y-4">
          <p className="text-sm text-accent" aria-live="polite">
            {state.message}
          </p>
          <label htmlFor={`${id}-secret`} className="block">
            <span className="mb-2 block text-sm text-ink-muted">Chave</span>
            <input
              ref={secretRef}
              id={`${id}-secret`}
              readOnly
              value={state.token}
              onFocus={(event) => event.currentTarget.select()}
              className={fieldClass}
            />
          </label>
          <button type="button" onClick={copyToken} className={buttonClass}>
            {copied ? "Copiada" : "Copiar chave"}
          </button>
          {copyFailed ? <p className="text-sm text-black dark:text-white">Selecione a chave e copie.</p> : null}
          {state.endpoint ? (
            <p className="break-all text-sm text-ink-muted">
              Base {state.endpoint}. Header Authorization: Bearer e a chave.
            </p>
          ) : null}
        </div>
      ) : null}

      <label htmlFor={`${id}-label`} className="block">
        <span className="mb-2 block text-sm text-ink-muted">Nome</span>
        <input
          id={`${id}-label`}
          name="label"
          defaultValue="James"
          autoComplete="off"
          required
          maxLength={64}
          className={fieldClass}
        />
      </label>
      {state.message && !state.token ? (
        <p className={state.ok ? "text-sm text-accent" : "text-sm text-black dark:text-white"} aria-live="polite">
          {state.message}
        </p>
      ) : null}
      <button type="submit" disabled={pending} className={buttonClass}>
        {pending ? "Gerando…" : "Gerar chave"}
      </button>
    </form>
  );
}

export function RevokeKeyForm({ action, id }: { action: Action; id: string }) {
  const [confirming, setConfirming] = useState(false);
  const [state, formAction, pending] = useActionState(action, idleKeyAction);

  if (!confirming) {
    return (
      <button type="button" onClick={() => setConfirming(true)} className={`mt-3 ${textButtonClass}`}>
        Revogar
      </button>
    );
  }

  return (
    <form action={formAction} className="mt-3 space-y-3">
      <input type="hidden" name="id" value={id} />
      <p className="text-sm">Revogar esta chave? O agente que a usa perde o acesso.</p>
      {state.message ? (
        <p className={state.ok ? "text-sm text-accent" : "text-sm text-black dark:text-white"} aria-live="polite">
          {state.message}
        </p>
      ) : null}
      <div className="flex flex-wrap items-center gap-4">
        <button type="submit" disabled={pending} className={buttonClass}>
          {pending ? "Revogando…" : "Revogar"}
        </button>
        <button type="button" onClick={() => setConfirming(false)} className={textButtonClass}>
          Cancelar
        </button>
      </div>
    </form>
  );
}
