import { redirect } from "next/navigation";
import { OwnPasswordForm } from "@/components/auth/auth-forms";
import { Logo } from "@/components/brand/logo";
import { ThemeToggle } from "@/components/theme-toggle";
import { changeOwnPasswordAction, logoutAction } from "@/lib/auth/actions";
import { currentUser } from "@/lib/auth/session";

export const dynamic = "force-dynamic";

/** Required stop: an account on the initial password, or reset by a master account, picks its own first. */
export default async function ChangePasswordPage() {
  const user = await currentUser();
  if (!user) redirect("/login");
  if (!user.mustChangePassword) redirect("/");

  return (
    <main className="mx-auto flex min-h-full w-full max-w-md flex-col px-5 py-8">
      <div className="flex items-center justify-between gap-6">
        <Logo markClassName="h-9 w-9" textClassName="text-3xl" />
        <ThemeToggle />
      </div>
      <h1 className="mt-16 font-display text-3xl leading-tight tracking-tight">Nova senha</h1>
      <p className="mt-3 text-sm text-ink-muted">
        {user.passwordIsDefault
          ? "Esta conta ainda usa a senha inicial. Escolha uma senha sua para continuar."
          : "Sua senha foi redefinida. Escolha uma senha sua para continuar."}
      </p>
      <div className="mt-8">
        <OwnPasswordForm action={changeOwnPasswordAction} />
      </div>
      <form action={logoutAction} className="mt-10">
        <button type="submit" className="min-h-11 text-sm text-ink-muted transition-colors duration-300 hover:text-black dark:hover:text-white">
          Sair
        </button>
      </form>
    </main>
  );
}
