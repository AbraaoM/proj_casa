import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { loginAction } from "@/lib/auth/actions";
import { currentUser } from "@/lib/auth/session";
import { LoginForm } from "@/components/auth/auth-forms";
import { Logo } from "@/components/brand/logo";
import { ThemeToggle } from "@/components/theme-toggle";

export const dynamic = "force-dynamic";

export default async function LoginPage() {
  if (await currentUser()) redirect("/");

  return (
    <main className="mx-auto flex min-h-full w-full max-w-md flex-col px-5 py-8">
      <div className="flex items-center justify-between gap-6">
        <Link href="/" aria-label="Casa, página inicial" className="rounded-md focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent">
          <Logo markClassName="h-9 w-9" textClassName="text-3xl" />
        </Link>
        <ThemeToggle />
      </div>
      <h1 className="mt-16 font-display text-3xl leading-tight tracking-tight">Entrar</h1>
      <p className="mt-3 text-sm text-ink-muted">Use a conta da casa para ver o que pede atenção.</p>
      <div className="mt-8">
        <LoginForm action={loginAction} />
      </div>
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
