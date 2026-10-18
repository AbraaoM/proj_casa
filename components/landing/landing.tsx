import Link from "next/link";
import {
  Bot,
  Car,
  CircleAlert,
  Dog,
  House,
  LayoutGrid,
  MessageCircle,
  NotebookPen,
  Pill,
  Users,
  Wallet,
  type LucideIcon,
} from "lucide-react";
import { Logo } from "@/components/brand/logo";
import { ThemeToggle } from "@/components/theme-toggle";

/**
 * Public presentation of the app. Static on purpose: it reads nothing from the
 * database, and every example below is made up.
 */

const FOCUS = "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent";
const ENTER = `inline-flex min-h-11 items-center justify-center rounded-md bg-accent px-6 text-sm font-medium text-soft-black transition-colors duration-300 hover:bg-accent-light ${FOCUS}`;

const STEPS: { icon: LucideIcon; title: string; text: string }[] = [
  { icon: MessageCircle, title: "Você conta no chat", text: "“Dei a vitamina agora.” “Paguei o condomínio.” Do jeito que sai." },
  { icon: NotebookPen, title: "O seu agente registra", text: "O agente anota no lugar certo, com data e hora, sem duplicar." },
  { icon: LayoutGrid, title: "O painel mostra o que pede atenção", text: "Atrasado primeiro, depois o que vence hoje e na semana." },
];

const SECTORS: { icon: LucideIcon; title: string; text: string }[] = [
  { icon: Dog, title: "Cães", text: "Vacina, vermífugo, banho e veterinário." },
  { icon: House, title: "Casa", text: "Manutenção por cômodo e prestadores." },
  { icon: Car, title: "Carro", text: "Revisão, IPVA, seguro e pneus." },
  { icon: Users, title: "Família", text: "Consultas, exames e documentos." },
  { icon: Wallet, title: "Finanças", text: "Contas a pagar, lançamentos e orçamento." },
  { icon: Pill, title: "Remédios", text: "Doses por hora e a próxima na tela." },
];

const PREVIEW: { title: string; who: string; when: string; late?: boolean }[] = [
  { title: "Vermífugo", who: "Thor", when: "atrasado 2 dias", late: true },
  { title: "Vitamina D", who: "Bebê", when: "próxima dose 07:00" },
  { title: "Condomínio", who: "Casa", when: "vence em 3 dias" },
];

export function Landing() {
  return (
    <div className="min-h-full">
      <header className="mx-auto flex w-full max-w-5xl items-center justify-between px-5 pt-[max(1.25rem,env(safe-area-inset-top))] md:px-10 md:pt-8">
        <Logo markClassName="h-9 w-9" textClassName="text-3xl" />
        <div className="flex items-center gap-3">
          <ThemeToggle />
          <Link href="/login" className={ENTER}>
            Entrar
          </Link>
        </div>
      </header>

      <main className="mx-auto w-full max-w-5xl px-5 md:px-10">
        <section className="py-16 md:py-24">
          <h1 className="max-w-3xl font-display text-5xl leading-[0.95] tracking-tight md:text-7xl">A casa em dia, sem planilha.</h1>
          <p className="mt-6 max-w-xl text-lg text-ink-muted">
            Cães, casa, carro, família, contas e remédios num painel só. Quem anota é o seu agente; você olha e confirma.
          </p>
          <Link href="/login" className={`${ENTER} mt-8`}>
            Entrar
          </Link>
        </section>

        <section aria-labelledby="como" className="border-t border-line py-12 dark:border-line-dark">
          <h2 id="como" className="font-display text-3xl tracking-tight">Como funciona</h2>
          <ol className="mt-8 grid gap-8 md:grid-cols-3">
            {STEPS.map((step, index) => (
              <li key={step.title}>
                <step.icon aria-hidden className="h-7 w-7 text-accent-dark dark:text-accent-light" strokeWidth={1.75} />
                <p className="mt-3 text-sm text-ink-faint">{index + 1}</p>
                <h3 className="text-lg">{step.title}</h3>
                <p className="mt-1 text-sm text-ink-muted">{step.text}</p>
              </li>
            ))}
          </ol>
        </section>

        <section aria-labelledby="setores" className="border-t border-line py-12 dark:border-line-dark">
          <h2 id="setores" className="font-display text-3xl tracking-tight">Tudo num lugar</h2>
          <ul className="mt-8 grid grid-cols-2 gap-3 md:grid-cols-3">
            {SECTORS.map((sector) => (
              <li key={sector.title} className="rounded-md border border-line p-4 dark:border-line-dark">
                <sector.icon aria-hidden className="h-6 w-6 text-ink-muted" strokeWidth={1.75} />
                <h3 className="mt-3 text-base">{sector.title}</h3>
                <p className="mt-1 text-sm text-ink-muted">{sector.text}</p>
              </li>
            ))}
          </ul>
        </section>

        <section aria-labelledby="painel" className="border-t border-line py-12 dark:border-line-dark">
          <h2 id="painel" className="font-display text-3xl tracking-tight">O painel, num relance</h2>
          <p className="mt-3 text-sm text-ink-muted">Exemplo com dados fictícios.</p>
          <ul className="mt-6 max-w-xl divide-y divide-line rounded-md border border-line dark:divide-line-dark dark:border-line-dark" aria-label="Exemplo do painel">
            {PREVIEW.map((row) => (
              <li key={row.title} className="flex items-center gap-3 px-4 py-3">
                {row.late ? (
                  <CircleAlert aria-hidden className="h-5 w-5 shrink-0 text-red-600 dark:text-red-400" strokeWidth={1.75} />
                ) : (
                  <span aria-hidden className="mx-1.5 h-2 w-2 shrink-0 rounded-full bg-accent" />
                )}
                <span className="min-w-0 flex-1">
                  {row.title} <span className="text-ink-muted">· {row.who}</span>
                </span>
                <span className={`text-sm ${row.late ? "text-red-700 dark:text-red-400" : "text-ink-muted"}`}>{row.when}</span>
              </li>
            ))}
          </ul>
        </section>

        <section aria-labelledby="agentes" className="border-t border-line py-12 dark:border-line-dark">
          <Bot aria-hidden className="h-7 w-7 text-accent-dark dark:text-accent-light" strokeWidth={1.75} />
          <h2 id="agentes" className="mt-3 font-display text-3xl tracking-tight">Feito para agentes</h2>
          <p className="mt-3 max-w-xl text-ink-muted">
            Uma API própria em <code className="rounded bg-line/60 px-1 text-sm dark:bg-line-dark">/api/agent</code>, com chaves estáveis e chamadas
            que podem repetir sem duplicar.
          </p>
        </section>
      </main>

      <footer className="mx-auto flex w-full max-w-5xl flex-wrap items-center justify-between gap-4 border-t border-line px-5 py-8 pb-[max(2rem,env(safe-area-inset-bottom))] text-sm text-ink-muted dark:border-line-dark md:px-10">
        <p>Projeto pessoal, código aberto.</p>
        <Link href="/login" className={ENTER}>
          Entrar
        </Link>
      </footer>
    </div>
  );
}
