import Link from "next/link";
import { Bot, Car, Check, Dog, House, Pill, Users, Wallet, type LucideIcon } from "lucide-react";
import { Logo } from "@/components/brand/logo";
import { ThemeToggle } from "@/components/theme-toggle";

/**
 * Public presentation of the app. Static on purpose: it reads nothing from the
 * database, and every example below is made up. The agent has no fixed name.
 */

const FOCUS = "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent";
const ENTER = `inline-flex min-h-11 items-center justify-center rounded-md bg-accent px-6 text-sm font-medium text-soft-black transition-colors duration-300 hover:bg-accent-light ${FOCUS}`;
const GHOST = `inline-flex min-h-11 items-center justify-center rounded-md border border-line px-5 text-sm font-medium transition-colors duration-300 hover:border-black dark:border-line-dark dark:hover:border-white ${FOCUS}`;
const CARD = "rounded-xl border border-line bg-white p-4 dark:border-line-dark dark:bg-soft-black";
const PILL = "inline-flex min-h-11 items-center rounded-full px-4 text-sm font-medium";

const SECTORS: { icon: LucideIcon; title: string; text: string }[] = [
  { icon: Dog, title: "Cães", text: "Vacina, vermífugo, banho e veterinário." },
  { icon: Pill, title: "Remédios", text: "Doses por hora e a próxima na tela." },
  { icon: Wallet, title: "Finanças", text: "Contas a pagar, lançamentos e orçamento." },
  { icon: Car, title: "Carro", text: "Revisão, IPVA, seguro e pneus." },
  { icon: House, title: "Casa", text: "Manutenção por cômodo." },
  { icon: Users, title: "Família", text: "Consultas, exames e documentos." },
];

const TAPS: { title: string; who: string; when: string; late?: boolean; actions: string[] }[] = [
  { title: "Vermífugo", who: "Thor", when: "atrasado 2 dias", late: true, actions: ["+1 dia", "Feito"] },
  { title: "Vitamina D", who: "Bebê", when: "dose das 07:00", actions: ["Dose dada"] },
  { title: "Energia", who: "Casa", when: "vence hoje · previsto R$ 210", actions: ["Paguei ~210"] },
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
        <section className="py-12 md:py-20">
          <h1 className="max-w-3xl font-display text-[2.75rem] leading-[0.95] tracking-tight md:text-7xl">
            Você fala com o seu agente. O Casa organiza.
          </h1>
          <p className="mt-6 max-w-xl text-lg text-ink-muted">
            Cães, casa, carro, família, contas e remédios num painel só. Funciona com o assistente que você já usa, com o nome que você
            der a ele.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Link href="/login" className={ENTER}>
              Entrar
            </Link>
            <a href="#como" className={GHOST}>
              Ver como funciona
            </a>
          </div>
        </section>

        <section aria-labelledby="como" className="scroll-mt-6 border-t border-line py-12 dark:border-line-dark">
          <h2 id="como" className="font-display text-3xl tracking-tight">
            Como funciona
          </h2>
          <p className="mt-2 text-sm text-ink-muted">Exemplo com dados fictícios.</p>
          <div className="mt-6 grid items-center gap-4 md:grid-cols-[1fr_auto_1fr]">
            <figure className={CARD} aria-label="No chat do seu agente">
              <figcaption className="text-xs text-ink-muted">no chat do seu agente</figcaption>
              <p className="mt-3 ml-auto w-fit max-w-[85%] rounded-2xl rounded-br-md bg-accent px-3 py-2 text-sm text-soft-black">
                Dei a vitamina do Bebê agora e paguei a luz.
              </p>
              <p className="mt-2 w-fit max-w-[85%] rounded-2xl rounded-bl-md bg-line px-3 py-2 text-sm dark:bg-line-dark">
                Anotado: dose às 07:02 e luz paga (R$ 210,00). Próxima dose amanhã às 07:00.
              </p>
            </figure>
            <p aria-hidden className="text-center text-2xl text-ink-faint">
              <span className="md:hidden">↓</span>
              <span className="hidden md:inline">→</span>
            </p>
            <figure className={CARD} aria-label="No Casa, na hora">
              <figcaption className="text-xs text-ink-muted">no Casa, na hora</figcaption>
              <ul className="mt-2 divide-y divide-line dark:divide-line-dark">
                {[
                  ["Vitamina D · Bebê", "dada às 07:02 · próxima amanhã 07:00"],
                  ["Energia", "paga · próxima em 10 de novembro"],
                ].map(([title, text]) => (
                  <li key={title} className="flex items-start gap-3 py-3">
                    <Check aria-hidden className="mt-0.5 h-5 w-5 shrink-0 text-accent-dark dark:text-accent-light" strokeWidth={2} />
                    <span>
                      {title}
                      <span className="block text-sm text-ink-muted">{text}</span>
                    </span>
                  </li>
                ))}
              </ul>
            </figure>
          </div>
        </section>

        <section aria-labelledby="toque" className="border-t border-line py-12 dark:border-line-dark">
          <h2 id="toque" className="font-display text-3xl tracking-tight">
            Ou um toque só
          </h2>
          <p className="mt-2 max-w-xl text-ink-muted">
            Sem formulário: Feito, Dose dada, Paguei, +1 dia ou Ignorar. Tocou duas vezes, vale uma. Errou? Desfaz em 5 segundos.
          </p>
          <div className={`${CARD} mt-6 max-w-xl`} aria-label="Exemplo de ações de um toque">
            <ul className="divide-y divide-line dark:divide-line-dark">
              {TAPS.map((row) => (
                <li key={row.title} className="flex flex-wrap items-center gap-x-3 gap-y-2 py-3">
                  <span className="min-w-0 flex-1">
                    {row.title} <span className="text-ink-muted">· {row.who}</span>
                    <span className={`block text-sm ${row.late ? "text-red-700 dark:text-red-400" : "text-ink-muted"}`}>{row.when}</span>
                  </span>
                  <span className="flex gap-2" aria-hidden>
                    {row.actions.map((label, index) => (
                      <span
                        key={label}
                        className={`${PILL} ${index === row.actions.length - 1 ? "bg-accent text-soft-black" : "bg-line dark:bg-line-dark"}`}
                      >
                        {label}
                      </span>
                    ))}
                  </span>
                </li>
              ))}
            </ul>
            <p className="mt-2 flex items-center justify-between rounded-lg bg-soft-black px-4 py-3 text-sm text-white dark:bg-white dark:text-soft-black">
              Vermífugo · Thor: feito <span className="font-medium text-accent-light dark:text-accent-dark">Desfazer (5)</span>
            </p>
          </div>
        </section>

        <section aria-labelledby="setores" className="border-t border-line py-12 dark:border-line-dark">
          <h2 id="setores" className="font-display text-3xl tracking-tight">
            Tudo num lugar
          </h2>
          <ul className="mt-8 grid grid-cols-2 gap-3 md:grid-cols-3">
            {SECTORS.map((sector) => (
              <li key={sector.title} className="rounded-xl border border-line p-4 dark:border-line-dark">
                <sector.icon aria-hidden className="h-6 w-6 text-ink-muted" strokeWidth={1.75} />
                <h3 className="mt-3 text-base">{sector.title}</h3>
                <p className="mt-1 text-sm text-ink-muted">{sector.text}</p>
              </li>
            ))}
          </ul>
        </section>

        <section aria-labelledby="agentes" className="border-t border-line py-12 dark:border-line-dark">
          <Bot aria-hidden className="h-7 w-7 text-accent-dark dark:text-accent-light" strokeWidth={1.75} />
          <h2 id="agentes" className="mt-3 font-display text-3xl tracking-tight">
            Feito para o seu agente
          </h2>
          <p className="mt-3 max-w-xl text-ink-muted">
            Qualquer assistente que chame uma API serve. Você gera uma chave no painel, entrega ao agente, e ele usa{" "}
            <code className="rounded bg-line/60 px-1 text-sm dark:bg-line-dark">/api/agent</code>: chamadas que podem repetir sem duplicar,
            com erros claros.
          </p>
        </section>
      </main>

      <footer className="mx-auto flex w-full max-w-5xl flex-wrap items-center justify-between gap-4 border-t border-line px-5 py-8 pb-[max(2rem,env(safe-area-inset-bottom))] text-sm text-ink-muted dark:border-line-dark md:px-10">
        <p>Projeto pessoal, código aberto. Exemplos fictícios.</p>
        <Link href="/login" className={ENTER}>
          Entrar
        </Link>
      </footer>
    </div>
  );
}
