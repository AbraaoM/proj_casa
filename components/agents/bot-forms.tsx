"use client";

import { useActionState, useEffect, useId, useState } from "react";
import type { BotActionState } from "@/lib/bot/actions";

type Action = (state: BotActionState, formData: FormData) => Promise<BotActionState>;
type ProviderOption = { value: string; label: string; note: string | null };

const idle: BotActionState = { ok: true, message: "", idle: true };

const fieldClass =
  "w-full rounded-md border border-line bg-transparent px-3 py-3 text-base outline-none transition-colors duration-300 placeholder:text-ink-faint focus:border-accent disabled:opacity-60 dark:border-line-dark";
const buttonClass =
  "min-h-11 rounded-md bg-accent px-4 py-3 text-sm font-medium text-soft-black transition-colors duration-300 hover:bg-accent-light focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:opacity-60";
const quietButtonClass =
  "min-h-11 rounded-md border border-line px-4 py-3 text-sm transition-colors duration-300 hover:border-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:opacity-60 dark:border-line-dark";

function Status({ state }: { state: BotActionState }) {
  if (state.idle || !state.message) return null;
  return (
    <div aria-live="polite" className="space-y-1">
      <p className={state.ok ? "text-sm text-accent" : "text-sm text-black dark:text-white"}>{state.message}</p>
      {state.details?.map((line) => (
        <p key={line} className="text-sm text-ink-muted">
          {line}
        </p>
      ))}
    </div>
  );
}

export function BotSettingsForm({
  action,
  providers,
  provider,
  model,
  baseUrl,
  aiKeyMasked,
  tokenMasked,
  secretsAllowed,
}: {
  action: Action;
  providers: ProviderOption[];
  provider: string;
  model: string;
  baseUrl: string | null;
  aiKeyMasked: string | null;
  tokenMasked: string | null;
  secretsAllowed: boolean;
}) {
  const [state, formAction, pending] = useActionState(action, idle);
  const [selected, setSelected] = useState(provider);
  const id = useId();
  const note = providers.find((option) => option.value === selected)?.note ?? null;

  return (
    <form action={formAction} className="mt-4 space-y-5" autoComplete="off">
      <label htmlFor={`${id}-provider`} className="block">
        <span className="mb-2 block text-sm text-ink-muted">Provedor de IA</span>
        <select id={`${id}-provider`} name="provider" value={selected} onChange={(event) => setSelected(event.target.value)} className={fieldClass}>
          {providers.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </label>
      {note ? <p className="text-sm text-ink-muted">{note}</p> : null}

      <label htmlFor={`${id}-model`} className="block">
        <span className="mb-2 block text-sm text-ink-muted">Modelo</span>
        <input id={`${id}-model`} name="model" defaultValue={model} maxLength={120} spellCheck={false} className={fieldClass} />
      </label>

      {selected === "openai-compatible" ? (
        <label htmlFor={`${id}-base`} className="block">
          <span className="mb-2 block text-sm text-ink-muted">URL base (https)</span>
          <input id={`${id}-base`} name="base_url" type="url" inputMode="url" defaultValue={baseUrl ?? ""} placeholder="https://…/v1" className={fieldClass} />
        </label>
      ) : null}

      <label htmlFor={`${id}-aikey`} className="block">
        <span className="mb-2 block text-sm text-ink-muted">Chave da API de IA {aiKeyMasked ? `· salva ${aiKeyMasked}` : "· não salva"}</span>
        <input
          id={`${id}-aikey`}
          name="ai_api_key"
          type="password"
          autoComplete="new-password"
          disabled={!secretsAllowed}
          placeholder={aiKeyMasked ? "Deixe vazio para manter" : "Cole a chave"}
          className={fieldClass}
        />
      </label>

      <label htmlFor={`${id}-token`} className="block">
        <span className="mb-2 block text-sm text-ink-muted">Token do bot (@BotFather) {tokenMasked ? `· salvo ${tokenMasked}` : "· não salvo"}</span>
        <input
          id={`${id}-token`}
          name="telegram_token"
          type="password"
          autoComplete="new-password"
          disabled={!secretsAllowed}
          placeholder={tokenMasked ? "Deixe vazio para manter" : "123456:ABC…"}
          className={fieldClass}
        />
      </label>

      <Status state={state} />
      <button type="submit" disabled={pending} className={buttonClass}>
        {pending ? "Salvando…" : "Salvar"}
      </button>
    </form>
  );
}

/** A button that runs one action and shows its answer below. */
export function BotActionButton({
  action,
  label,
  pendingLabel,
  quiet = false,
  fields,
  disabled = false,
}: {
  action: Action;
  label: string;
  pendingLabel: string;
  quiet?: boolean;
  fields?: Record<string, string>;
  disabled?: boolean;
}) {
  const [state, formAction, pending] = useActionState(action, idle);
  return (
    <form action={formAction} className="space-y-3">
      {fields ? Object.entries(fields).map(([name, value]) => <input key={name} type="hidden" name={name} value={value} />) : null}
      <button type="submit" disabled={pending || disabled} className={quiet ? quietButtonClass : buttonClass}>
        {pending ? pendingLabel : label}
      </button>
      <Status state={state} />
    </form>
  );
}

/** One tap: makes a single-use code and opens t.me/<bot>?start=<code>. */
export function ConnectTelegramButton({ action, disabled }: { action: Action; disabled?: boolean }) {
  const [state, formAction, pending] = useActionState(action, idle);
  useEffect(() => {
    if (state.ok && state.url) window.location.assign(state.url);
  }, [state]);
  return (
    <form action={formAction} className="space-y-3">
      <button type="submit" disabled={pending || disabled} className={buttonClass}>
        {pending ? "Abrindo…" : "Conectar Telegram"}
      </button>
      <Status state={state} />
      {state.ok && state.url ? (
        <p className="text-sm text-ink-muted">
          Não abriu?{" "}
          <a href={state.url} className="underline underline-offset-4">
            Abrir o Telegram
          </a>
        </p>
      ) : null}
    </form>
  );
}
