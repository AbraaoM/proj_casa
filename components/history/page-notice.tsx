import Link from "next/link";

const COPY = {
  unconfigured: ["O banco ainda não está ligado.", "Defina DATABASE_URL para ver o histórico."],
  schema_missing: ["As tabelas ainda não existem.", "Rode npm run db:migrate."],
  error: ["Não consegui ler o histórico.", "O banco respondeu com erro. Tente de novo em instantes."],
  not_found: ["Não encontrei esse registro.", "Ele pode ter sido arquivado ou o endereço está errado."],
} as const;

export function PageNotice({ status, backHref = "/" }: { status: keyof typeof COPY; backHref?: string }) {
  const [title, hint] = COPY[status];
  return (
    <main className="mx-auto w-full max-w-3xl px-5 py-8 md:max-w-5xl md:px-10 md:py-12">
      <h1 className="font-display text-3xl leading-tight tracking-tight md:text-4xl">{title}</h1>
      <p className="mt-3 max-w-md text-base text-ink-muted">{hint}</p>
      <Link
        href={backHref}
        className="mt-8 inline-block text-sm text-accent-dark underline-offset-4 transition-colors duration-300 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent dark:text-accent-light"
      >
        Voltar
      </Link>
    </main>
  );
}
