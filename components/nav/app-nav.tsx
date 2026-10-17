"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { LogOut } from "lucide-react";
import { LogoMark } from "@/components/brand/logo";
import { NAV_ICONS } from "@/components/nav/nav-icon";
import { ThemeToggle } from "@/components/theme-toggle";
import { logoutAction } from "@/lib/auth/actions";
import { ACCOUNT, BOTTOM_BAR, SECTORS, activeBottom, activeSector, type NavEntry, type NavKey } from "@/lib/ui/nav";

const FOCUS = "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent";

/** Desktop and tablet: fixed sidebar. Labels from lg, icons only on md. */
export function Sidebar({ username }: { username: string }) {
  const active = activeSector(usePathname());
  return (
    <aside className="fixed inset-y-0 left-0 z-30 hidden w-20 flex-col border-r border-line bg-soft-white px-3 py-6 dark:border-line-dark dark:bg-soft-black md:flex lg:w-60 lg:px-5">
      <Link href="/" className={`flex items-center gap-2.5 rounded-md px-2 ${FOCUS}`} aria-label="Casa, painel">
        <LogoMark className="h-9 w-9 shrink-0" />
        <span className="hidden font-display text-3xl leading-none tracking-tight lg:inline">Casa</span>
      </Link>
      <nav aria-label="Setores" className="mt-10">
        <ul className="space-y-1">
          {SECTORS.map((entry) => (
            <SideLink key={entry.key} entry={entry} active={active === entry.key} />
          ))}
        </ul>
      </nav>
      <div className="mt-auto space-y-1 border-t border-line pt-4 dark:border-line-dark">
        <ul className="space-y-1">
          {ACCOUNT.map((entry) => (
            <SideLink key={entry.key} entry={entry} active={active === entry.key} />
          ))}
        </ul>
        <form action={logoutAction}>
          <button
            type="submit"
            title="Sair"
            className={`flex min-h-11 w-full items-center gap-3 rounded-md px-3 text-sm text-ink-muted transition-colors duration-300 hover:bg-line/60 hover:text-black dark:hover:bg-line-dark dark:hover:text-white ${FOCUS}`}
          >
            <LogOut aria-hidden className="h-5 w-5 shrink-0" strokeWidth={1.75} />
            <span className="hidden lg:inline">Sair</span>
            <span className="sr-only lg:hidden">Sair</span>
          </button>
        </form>
        <div className="flex items-center justify-between gap-2 px-1 pt-2">
          <span className="hidden truncate text-xs text-ink-faint lg:inline">{username}</span>
          <ThemeToggle />
        </div>
      </div>
    </aside>
  );
}

function SideLink({ entry, active }: { entry: NavEntry; active: boolean }) {
  const Icon = NAV_ICONS[entry.key];
  return (
    <li>
      <Link
        href={entry.href}
        title={entry.label}
        aria-current={active ? "page" : undefined}
        className={`flex min-h-11 items-center gap-3 rounded-md px-3 text-sm transition-colors duration-300 ${FOCUS} ${
          active
            ? "bg-accent/10 text-accent-dark dark:bg-accent/15 dark:text-accent-light"
            : "text-ink-muted hover:bg-line/60 hover:text-black dark:hover:bg-line-dark dark:hover:text-white"
        }`}
      >
        <Icon aria-hidden className="h-5 w-5 shrink-0" strokeWidth={1.75} />
        <span className="hidden lg:inline">{entry.label}</span>
        <span className="sr-only lg:hidden">{entry.label}</span>
      </Link>
    </li>
  );
}

/** Phone: thin top bar with the mark and the theme. */
export function TopBar() {
  return (
    <div className="flex items-center justify-between px-5 pt-[max(1rem,env(safe-area-inset-top))] md:hidden">
      <Link href="/" className={`rounded-md ${FOCUS}`} aria-label="Casa, painel">
        <span className="inline-flex items-center gap-2">
          <LogoMark className="h-8 w-8" />
          <span className="font-display text-2xl leading-none tracking-tight">Casa</span>
        </span>
      </Link>
      <ThemeToggle />
    </div>
  );
}

/** Phone: fixed bottom bar with four sectors and "Mais". */
export function BottomBar() {
  const active: NavKey | null = activeBottom(usePathname());
  return (
    <nav
      aria-label="Principal"
      className="fixed inset-x-0 bottom-0 z-30 border-t border-line bg-soft-white/95 pb-[env(safe-area-inset-bottom)] backdrop-blur dark:border-line-dark dark:bg-soft-black/95 md:hidden"
    >
      <ul className="mx-auto grid max-w-md grid-cols-5">
        {BOTTOM_BAR.map((entry) => {
          const Icon = NAV_ICONS[entry.key];
          const selected = active === entry.key;
          return (
            <li key={entry.key}>
              <Link
                href={entry.href}
                aria-current={selected ? "page" : undefined}
                className={`flex min-h-14 flex-col items-center justify-center gap-1 text-[11px] transition-colors duration-300 ${FOCUS} ${
                  selected ? "text-accent-dark dark:text-accent-light" : "text-ink-muted hover:text-black dark:hover:text-white"
                }`}
              >
                <Icon aria-hidden className="h-6 w-6" strokeWidth={selected ? 2 : 1.75} />
                {entry.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
