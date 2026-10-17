import Link from "next/link";
import { ChevronRight, LogOut } from "lucide-react";
import { NAV_ICONS } from "@/components/nav/nav-icon";
import { ThemeToggle } from "@/components/theme-toggle";
import { logoutAction } from "@/lib/auth/actions";
import { currentUser } from "@/lib/auth/session";
import { MORE_ENTRIES } from "@/lib/ui/nav";

export const dynamic = "force-dynamic";

const ROW =
  "flex min-h-14 w-full items-center gap-4 border-t border-line text-base transition-colors duration-300 first:border-t-0 hover:text-accent-dark focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent dark:border-line-dark dark:hover:text-accent-light";

/** Phone menu: the sectors and account pages that do not fit in the bottom bar. */
export default async function MorePage() {
  const user = await currentUser();
  return (
    <main className="mx-auto w-full max-w-3xl px-5 py-8 md:max-w-5xl md:px-10 md:py-12">
      <h1 className="font-display text-5xl leading-none tracking-tight">Mais</h1>
      {user ? <p className="mt-3 text-sm text-ink-muted">Conectado como {user.username}</p> : null}
      <ul className="mt-8">
        {MORE_ENTRIES.map((entry) => {
          const Icon = NAV_ICONS[entry.key];
          return (
            <li key={entry.key}>
              <Link href={entry.href} className={ROW}>
                <Icon aria-hidden className="h-5 w-5 text-ink-muted" strokeWidth={1.75} />
                <span className="flex-1">{entry.label}</span>
                <ChevronRight aria-hidden className="h-4 w-4 text-ink-faint" />
              </Link>
            </li>
          );
        })}
      </ul>
      <div className="mt-8 flex items-center justify-between border-t border-line pt-4 dark:border-line-dark">
        <span className="text-sm text-ink-muted">Tema</span>
        <ThemeToggle />
      </div>
      <form action={logoutAction} className="mt-4 border-t border-line pt-2 dark:border-line-dark">
        <button type="submit" className={`${ROW} border-t-0 text-ink-muted`}>
          <LogOut aria-hidden className="h-5 w-5" strokeWidth={1.75} />
          Sair
        </button>
      </form>
    </main>
  );
}
