"use client";

import { useEffect, useId, useRef } from "react";
import type { FormState } from "@/lib/auth/types";
import { useActionState } from "react";

type Action = (state: FormState, formData: FormData) => Promise<FormState>;

const fieldClass =
  "w-full rounded-md border border-line bg-transparent px-3 py-3 text-base outline-none transition-colors duration-300 placeholder:text-ink-faint focus:border-accent dark:border-line-dark";

const buttonClass =
  "min-h-11 rounded-md bg-accent px-4 py-3 text-sm font-medium text-soft-black transition-colors duration-300 hover:bg-accent-light focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:opacity-60";

export function LoginForm({ action }: { action: Action }) {
  return (
    <AuthForm action={action} submitLabel="Entrar" pendingLabel="Entrando…">
      <Field label="Usuário" name="username" autoComplete="username" />
      <Field label="Senha" name="password" type="password" autoComplete="current-password" />
    </AuthForm>
  );
}

export function FirstAccountForm({ action }: { action: Action }) {
  return (
    <AuthForm action={action} submitLabel="Criar a primeira conta" pendingLabel="Criando…">
      <Field label="Usuário" name="username" autoComplete="username" />
      <Field label="Senha (8 ou mais caracteres)" name="password" type="password" autoComplete="new-password" />
      <Field label="Confirmar senha" name="confirm" type="password" autoComplete="new-password" />
    </AuthForm>
  );
}

export function SignUpForm({ action }: { action: Action }) {
  return (
    <AuthForm action={action} submitLabel="Criar minha família · 14 dias grátis" pendingLabel="Criando…">
      <Honeypot />
      <Field label="Nome da família" name="family_name" autoComplete="organization" maxLength={60} />
      <Field label="Usuário" name="username" autoComplete="username" />
      <Field label="Senha (8 ou mais caracteres)" name="password" type="password" autoComplete="new-password" />
      <Field label="Confirmar senha" name="confirm" type="password" autoComplete="new-password" />
      <Terms />
    </AuthForm>
  );
}

export function JoinForm({ action, code }: { action: Action; code: string }) {
  return (
    <AuthForm action={action} submitLabel="Entrar na família" pendingLabel="Entrando…">
      <Honeypot />
      <input type="hidden" name="code" value={code} />
      <Field label="Usuário" name="username" autoComplete="username" />
      <Field label="Senha (8 ou mais caracteres)" name="password" type="password" autoComplete="new-password" />
      <Field label="Confirmar senha" name="confirm" type="password" autoComplete="new-password" />
      <Terms />
    </AuthForm>
  );
}

/** A field only bots fill in: hidden from people and from assistive tech. */
function Honeypot() {
  return (
    <div aria-hidden className="absolute -left-[9999px] h-0 w-0 overflow-hidden">
      <label>
        Não preencha
        <input type="text" name="website" tabIndex={-1} autoComplete="off" />
      </label>
    </div>
  );
}

function Terms() {
  const id = useId();
  return (
    <label htmlFor={id} className="flex min-h-11 items-start gap-3 text-sm text-ink-muted">
      <input id={id} name="terms" type="checkbox" required className="mt-1 h-5 w-5 shrink-0 accent-accent" />
      <span>
        Li os <a href="/termos" target="_blank" rel="noopener" className="underline underline-offset-2">termos</a> e a{" "}
        <a href="/privacidade" target="_blank" rel="noopener" className="underline underline-offset-2">privacidade</a>.
      </span>
    </label>
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
        <p className={state.ok ? "text-sm text-accent-dark dark:text-accent-light" : "text-sm text-black dark:text-white"} aria-live="polite">
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
  maxLength,
}: {
  label: string;
  name: string;
  type?: "text" | "password";
  autoComplete: string;
  maxLength?: number;
}) {
  const id = useId();
  return (
    <label htmlFor={id} className="block">
      <span className="mb-2 block text-sm text-ink-muted">{label}</span>
      <input id={id} name={name} type={type} autoComplete={autoComplete} maxLength={maxLength} required className={fieldClass} />
    </label>
  );
}
