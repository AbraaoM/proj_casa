import type { ReactNode } from "react";
import { BackLink } from "@/components/history/back-link";

export function ListPage({
  title,
  intro,
  count,
  empty,
  children,
}: {
  title: string;
  intro: string;
  count: number;
  empty: string;
  children: ReactNode;
}) {
  return (
    <main className="mx-auto w-full max-w-3xl px-5 py-8 md:max-w-5xl md:px-10 md:py-12">
      <BackLink href="/" label="Painel" />
      <h1 className="mt-6 font-display text-5xl leading-none tracking-tight md:text-6xl">{title}</h1>
      <p className="mt-3 max-w-md text-base text-ink-muted">{intro}</p>
      {count === 0 ? (
        <p className="mt-12 text-sm text-ink-muted">{empty}</p>
      ) : (
        <ul className="mt-12 grid gap-10 md:grid-cols-2 md:gap-x-16 md:gap-y-12">{children}</ul>
      )}
    </main>
  );
}
