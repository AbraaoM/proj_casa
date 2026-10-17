"use client";

import { useEffect, useId, useRef } from "react";
import type { FormState } from "@/lib/auth/types";
import { useActionState } from "react";

type Action = (state: FormState, formData: FormData) => Promise<FormState>;

const fieldClass =
  "w-full border border-line bg-transparent px-3 py-3 text-base outline-none transition-colors duration-300 placeholder:text-ink-faint focus:border-accent dark:border-line-dark";

const buttonClass =
  "bg-accent px-4 py-3 text-sm text-white transition-colors duration-300 hover:bg-accent-dark focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:opacity-60";

export function LoginForm({ action }: { action: Action }) {
  return (
    <AuthForm action={action} submitLabel="Entrar" pendingLabel="Entrando…">
      <Field label="Usuário" name="username" autoComplete="username" />
      <Field label="Senha" name="password" type="password" autoComplete="current-password" />
    </AuthForm>
  );
}

export function OwnPasswordForm({ action }: { action: Action }) {
  return (
    <AuthForm action={action} submitLabel="Trocar senha" pendingLabel="Salvando…" resetOnSuccess>
      <Field label="Senha atual" name="current_password" type="password" autoComplete="current-password" />
      <Field label="Nova senha" name="password" type="password" autoComplete="new-password" />
      <Field label="Confirmar senha" name="confirm" type="password" autoComplete="new-password" />
    </AuthForm>
  );
}

export function CreateUserForm({ action }: { action: Action }) {
  return (
    <AuthForm action={action} submitLabel="Criar usuário" pendingLabel="Criando…" resetOnSuccess>
      <Field label="Usuário" name="username" autoComplete="off" />
      <Field label="Senha" name="password" type="password" autoComplete="new-password" />
      <Field label="Confirmar senha" name="confirm" type="password" autoComplete="new-password" />
    </AuthForm>
  );
}

export function SetPasswordForm({ action, userId }: { action: Action; userId: string }) {
  return (
    <AuthForm action={action} submitLabel="Definir senha" pendingLabel="Salvando…" resetOnSuccess>
      <input type="hidden" name="user_id" value={userId} />
      <Field label="Nova senha" name="password" type="password" autoComplete="new-password" />
      <Field label="Confirmar senha" name="confirm" type="password" autoComplete="new-password" />
    </AuthForm>
  );
}

function AuthForm({
  action,
  submitLabel,
  pendingLabel,
  resetOnSuccess = false,
  children,
}: {
  action: Action;
  submitLabel: string;
  pendingLabel: string;
  resetOnSuccess?: boolean;
  children: React.ReactNode;
}) {
  const [state, formAction, pending] = useActionState(action, { ok: false, message: "" });
  const ref = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (resetOnSuccess && state.ok) ref.current?.reset();
  }, [resetOnSuccess, state]);

  return (
    <form ref={ref} action={formAction} className="mt-4 space-y-4">
      {children}
      {state.message ? (
        <p className={state.ok ? "text-sm text-accent" : "text-sm text-black dark:text-white"} aria-live="polite">
          {state.message}
        </p>
      ) : null}
      <button type="submit" disabled={pending} className={buttonClass}>
        {pending ? pendingLabel : submitLabel}
      </button>
    </form>
  );
}

function Field({
  label,
  name,
  type = "text",
  autoComplete,
}: {
  label: string;
  name: string;
  type?: "text" | "password";
  autoComplete: string;
}) {
  const id = useId();
  return (
    <label htmlFor={id} className="block">
      <span className="mb-2 block text-sm text-ink-muted">{label}</span>
      <input id={id} name={name} type={type} autoComplete={autoComplete} required className={fieldClass} />
    </label>
  );
}
