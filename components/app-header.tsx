import Link from "next/link";
import { logoutAction } from "@/lib/auth/actions";
import type { AccountUser } from "@/lib/auth/types";
import { ThemeToggle } from "@/components/theme-toggle";

export function AppHeader({ user }: { user: AccountUser }) {
  return (
    <header className="mx-auto flex w-full max-w-3xl flex-wrap items-center justify-between gap-4 px-5 pt-8 md:max-w-5xl md:px-10 md:pt-12">
      <Link href="/" className="font-display text-4xl leading-none tracking-tight">
        Casa
      </Link>
      <div className="flex flex-wrap items-center justify-end gap-x-4 gap-y-2">
        <span className="text-sm text-ink-muted">{user.username}</span>
        <Link
          href="/usuarios"
          className="text-sm text-ink-muted transition-colors duration-300 hover:text-black focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent dark:hover:text-white"
        >
          Usuários
        </Link>
        <form action={logoutAction}>
          <button
            type="submit"
            className="text-sm text-ink-muted transition-colors duration-300 hover:text-black focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent dark:hover:text-white"
          >
            Sair
          </button>
        </form>
        <ThemeToggle />
      </div>
    </header>
  );
}
