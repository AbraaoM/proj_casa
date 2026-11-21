import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { Logo } from "@/components/brand/logo";
import { ThemeToggle } from "@/components/theme-toggle";

/** The frame of the public account screens: sign-up, invite, login. */
export function PublicFrame({ children, backLabel = "Voltar ao início" }: { children: React.ReactNode; backLabel?: string }) {
  return (
    <main className="mx-auto flex min-h-full w-full max-w-md flex-col px-5 py-8">
      <div className="flex items-center justify-between gap-6">
        <Link href="/" aria-label="Página inicial" className="rounded-md focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent">
          <Logo markClassName="h-9 w-9" textClassName="text-3xl" />
        </Link>
        <ThemeToggle />
      </div>
      {children}
      <Link
        href="/"
        className="mt-10 inline-flex min-h-11 items-center gap-2 self-start rounded-md text-sm text-ink-muted transition-colors duration-300 hover:text-black focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent dark:hover:text-white"
      >
        <ArrowLeft aria-hidden className="h-4 w-4" strokeWidth={1.75} />
        {backLabel}
      </Link>
    </main>
  );
}
