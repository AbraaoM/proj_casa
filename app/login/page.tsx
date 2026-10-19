import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { loginAction, setupFirstAccountAction } from "@/lib/auth/actions";
import { firstRunMode } from "@/lib/auth/policy";
import { tryGetSql } from "@/lib/db/client";
import { countUsers } from "@/lib/repositories/accounts";
import { currentUser } from "@/lib/auth/session";
import { FirstAccountForm, LoginForm } from "@/components/auth/auth-forms";
import { Logo } from "@/components/brand/logo";
import { ThemeToggle } from "@/components/theme-toggle";

export const dynamic = "force-dynamic";

export default async function LoginPage() {
  if (await currentUser()) redirect("/");
  const firstRun = (await noAccountYet()) ? firstRunMode() : null;

  return (
    <main className="mx-auto flex min-h-full w-full max-w-md flex-col px-5 py-8">
      <div className="flex items-center justify-between gap-6">
        <Link href="/" aria-label="Casa, página inicial" className="rounded-md focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent">
          <Logo markClassName="h-9 w-9" textClassName="text-3xl" />
        </Link>
        <ThemeToggle />
      </div>
      {firstRun === "form" ? (
        <>
          <h1 className="mt-16 font-display text-3xl leading-tight tracking-tight">Primeira conta</h1>
          <p className="mt-3 text-sm text-ink-muted">
            Ainda não há conta. Escolha o usuário e a senha da conta master da casa.
          </p>
          <div className="mt-8">
            <FirstAccountForm action={setupFirstAccountAction} />
          </div>
        </>
      ) : firstRun === "seed_only" ? (
        <>
          <h1 className="mt-16 font-display text-3xl leading-tight tracking-tight">Primeira conta</h1>
          <p className="mt-3 text-sm text-ink-muted">
            Ainda não há conta. Neste endereço público ela não é criada pela tela: rode{" "}
            <code>npm run db:migrate</code> com <code>CASA_FIRST_USERNAME</code> e <code>CASA_FIRST_PASSWORD</code> no
            terminal.
          </p>
        </>
      ) : (
        <>
          <h1 className="mt-16 font-display text-3xl leading-tight tracking-tight">Entrar</h1>
          <p className="mt-3 text-sm text-ink-muted">Use a conta da casa para ver o que pede atenção.</p>
          <div className="mt-8">
            <LoginForm action={loginAction} />
          </div>
        </>
      )}
      <Link
        href="/"
        className="mt-10 inline-flex min-h-11 items-center gap-2 self-start rounded-md text-sm text-ink-muted transition-colors duration-300 hover:text-black focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent dark:hover:text-white"
      >
        <ArrowLeft aria-hidden className="h-4 w-4" strokeWidth={1.75} />
        Conhecer o Casa
      </Link>
    </main>
  );
}

async function noAccountYet(): Promise<boolean> {
  const sql = tryGetSql();
  if (!sql) return false;
  try {
    return (await countUsers(sql)) === 0;
  } catch {
    return false;
  }
}
