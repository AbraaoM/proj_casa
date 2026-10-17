import { redirect } from "next/navigation";
import { loginAction } from "@/lib/auth/actions";
import { currentUser } from "@/lib/auth/session";
import { LoginForm } from "@/components/auth/auth-forms";
import { ThemeToggle } from "@/components/theme-toggle";

export const dynamic = "force-dynamic";

export default async function LoginPage() {
  if (await currentUser()) redirect("/");

  return (
    <main className="mx-auto flex min-h-full w-full max-w-md flex-col px-5 py-8">
      <div className="flex items-start justify-between gap-6">
        <p className="font-display text-4xl leading-none tracking-tight">Casa</p>
        <ThemeToggle />
      </div>
      <h1 className="mt-16 font-display text-3xl leading-tight tracking-tight">Entrar</h1>
      <p className="mt-3 text-sm text-ink-muted">Use a conta da casa para ver o que pede atenção.</p>
      <div className="mt-8">
        <LoginForm action={loginAction} />
      </div>
    </main>
  );
}
