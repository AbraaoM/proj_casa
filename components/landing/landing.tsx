import Link from "next/link";
import { Bot, CalendarCheck, Car, Check, Dog, House, MessageCircle, Pill, Send, ShieldCheck, UserPlus, Users, Wallet, type LucideIcon } from "lucide-react";
import { Logo } from "@/components/brand/logo";
import { ThemeToggle } from "@/components/theme-toggle";
import { SITE_DESCRIPTION, SITE_NAME, SITE_URL } from "@/lib/site";

/**
 * Public presentation of the product. Static on purpose: it reads nothing from the database.
 * No price, no promised results, no numbers or testimonials that do not exist: every example
 * below is made up and says so. The agent has no fixed name ("seu agente").
 */

const FOCUS = "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent";
const PRIMARY = `inline-flex min-h-12 items-center justify-center rounded-md bg-accent px-6 text-base font-medium text-soft-black transition-colors duration-300 hover:bg-accent-light ${FOCUS}`;
const SMALL = `inline-flex min-h-11 items-center justify-center rounded-md bg-accent px-4 text-sm font-medium text-soft-black transition-colors duration-300 hover:bg-accent-light ${FOCUS}`;
const GHOST = `inline-flex min-h-12 items-center justify-center rounded-md border border-line px-5 text-base font-medium transition-colors duration-300 hover:border-black dark:border-line-dark dark:hover:border-white ${FOCUS}`;
const CARD = "rounded-xl border border-line bg-white p-4 dark:border-line-dark dark:bg-soft-black";
const SECTION = "border-t border-line py-14 dark:border-line-dark md:py-20";
const H2 = "font-display text-3xl tracking-tight md:text-5xl";
const PILL = "inline-flex min-h-11 items-center rounded-full px-4 text-sm font-medium";

const AREAS: { icon: LucideIcon; title: string; text: string }[] = [
  { icon: Dog, title: "Pets", text: "Vacina, vermífugo, banho e veterinário, com o histórico de cada animal." },
  { icon: Car, title: "Carros", text: "Revisão, IPVA, seguro e pneus, sem perder o prazo." },
  { icon: House, title: "Rotinas da casa", text: "O que limpar e consertar em cada cômodo, e quem fez." },
  { icon: Wallet, title: "Contas", text: "Contas a pagar, lançamentos, orçamento e o fechamento do mês." },
  { icon: Pill, title: "Remédios e saúde", text: "Doses por horário, consultas e exames de cada pessoa." },
  { icon: Users, title: "A família toda", text: "Cada pessoa com a própria conta, todas vendo a mesma casa." },
];

const STEPS: { icon: LucideIcon; title: string; text: string }[] = [
  { icon: House, title: "Crie a sua família", text: "Um usuário, uma senha e o nome da família. Sem cartão." },
  { icon: UserPlus, title: "Convide a casa", text: "Um toque gera um link para cada pessoa entrar com a própria conta." },
  { icon: MessageCircle, title: "Conte ao seu agente", text: "Fale no Telegram ou toque no painel. O que pede atenção aparece na hora." },
];

const TAPS: { title: string; who: string; when: string; late?: boolean; actions: string[] }[] = [
  { title: "Vermífugo", who: "Thor", when: "atrasado 2 dias", late: true, actions: ["+1 dia", "Feito"] },
  { title: "Vitamina D", who: "Bebê", when: "dose das 07:00", actions: ["Dose dada"] },
  { title: "Energia", who: "Casa", when: "vence hoje · previsto R$ 210", actions: ["Paguei ~210"] },
];

const FAQ: { q: string; a: string }[] = [
  { q: "Quanto custa?", a: "O teste dura 14 dias e não pede cartão. Ainda não há plano pago. Quando houver, você vê antes de qualquer cobrança." },
  { q: "O que acontece quando os 14 dias acabam?", a: "A família fica só para consulta: nada é apagado e nada é cobrado. Você vê tudo, mas não cadastra nem altera até haver um plano." },
  { q: "Os dados da minha família ficam separados dos outros?", a: "Sim. Cada família só enxerga os próprios dados, e essa separação é feita no banco de dados, não só na tela." },
  { q: "Preciso do Telegram?", a: "Não. O painel funciona sozinho, com toques. O Telegram é um jeito a mais de falar com o seu agente." },
  { q: "Posso convidar quem mora comigo?", a: "Pode. Quem cria a família gera um link por pessoa. Cada pessoa tem o próprio usuário e a própria senha." },
];

const JSON_LD = {
  "@context": "https://schema.org",
  "@type": "SoftwareApplication",
  name: SITE_NAME,
  applicationCategory: "LifestyleApplication",
  operatingSystem: "Web",
  inLanguage: "pt-BR",
  url: SITE_URL,
  description: SITE_DESCRIPTION,
};

export function Landing() {
  return (
    <div className="min-h-full">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(JSON_LD) }} />
      <header className="mx-auto flex w-full max-w-5xl items-center justify-between px-5 pt-[max(1.25rem,env(safe-area-inset-top))] md:px-10 md:pt-8">
        <Logo markClassName="h-9 w-9" textClassName="text-3xl" />
        <div className="flex items-center gap-2 sm:gap-3">
          <ThemeToggle />
          <Link href="/login" className={`${FOCUS} inline-flex min-h-11 items-center rounded-md px-3 text-sm font-medium underline-offset-4 hover:underline`}>
            Entrar
          </Link>
          <Link href="/cadastrar" className={`${SMALL} hidden sm:inline-flex`}>
            Comece 14 dias grátis
          </Link>
        </div>
      </header>

      <main className="mx-auto w-full max-w-5xl px-5 md:px-10">
        <section className="py-12 md:py-24">
          <p className="text-sm font-medium uppercase tracking-wider text-accent-dark dark:text-accent-light">Para quem cuida de uma casa</p>
          <h1 className="mt-4 max-w-3xl font-display text-[2.75rem] leading-[0.95] tracking-tight md:text-7xl">
            A casa da sua família, organizada.
          </h1>
          <p className="mt-6 max-w-xl text-lg text-ink-muted">
            Pets, carros, rotinas da casa, contas e remédios num painel só. Você fala com o seu agente no Telegram e a {SITE_NAME} guarda,
            lembra e mostra o que pede atenção hoje.
          </p>
          <div className="mt-8 flex flex-wrap items-center gap-3">
            <Link href="/cadastrar" className={PRIMARY}>
              Criar minha família · 14 dias grátis
            </Link>
            <a href="#como" className={GHOST}>
              Ver como funciona
            </a>
          </div>
          <p className="mt-4 text-sm text-ink-muted">Sem cartão. Cada família tem os próprios dados, separados das outras.</p>
        </section>

        <section aria-labelledby="areas" className={SECTION}>
          <h2 id="areas" className={H2}>
            Tudo o que a casa pede, num lugar
          </h2>
          <ul className="mt-8 grid gap-3 sm:grid-cols-2 md:grid-cols-3">
            {AREAS.map((area) => (
              <li key={area.title} className="rounded-xl border border-line p-5 dark:border-line-dark">
                <area.icon aria-hidden className="h-6 w-6 text-accent-dark dark:text-accent-light" strokeWidth={1.75} />
                <h3 className="mt-3 text-lg">{area.title}</h3>
                <p className="mt-1 text-sm text-ink-muted">{area.text}</p>
              </li>
            ))}
          </ul>
        </section>

        <section aria-labelledby="como" className={`scroll-mt-6 ${SECTION}`}>
          <h2 id="como" className={H2}>
            Como funciona
          </h2>
          <ol className="mt-8 grid gap-6 md:grid-cols-3">
            {STEPS.map((step, index) => (
              <li key={step.title}>
                <p className="flex items-center gap-3">
                  <span aria-hidden className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-accent font-display text-lg text-soft-black">
                    {index + 1}
                  </span>
                  <step.icon aria-hidden className="h-5 w-5 text-ink-muted" strokeWidth={1.75} />
                </p>
                <h3 className="mt-3 text-lg">{step.title}</h3>
                <p className="mt-1 text-sm text-ink-muted">{step.text}</p>
              </li>
            ))}
          </ol>
        </section>

        <section aria-labelledby="agente" className={SECTION}>
          <Bot aria-hidden className="h-7 w-7 text-accent-dark dark:text-accent-light" strokeWidth={1.75} />
          <h2 id="agente" className={`mt-3 ${H2}`}>
            Fale com o seu agente
          </h2>
          <p className="mt-3 max-w-xl text-ink-muted">
            Cada família liga o próprio bot no Telegram e dá o nome que quiser ao agente. Ele anota o que você conta e responde com o que
            está na casa. Qualquer assistente que chame a nossa API também serve.
          </p>
          <p className="mt-2 text-sm text-ink-muted">Exemplo com dados fictícios.</p>
          <div className="mt-6 grid items-center gap-4 md:grid-cols-[1fr_auto_1fr]">
            <figure className={CARD} aria-label="Conversa com o seu agente no Telegram">
              <figcaption className="flex items-center gap-2 text-xs text-ink-muted">
                <Send aria-hidden className="h-3.5 w-3.5" strokeWidth={1.75} />
                no Telegram, com o seu agente
              </figcaption>
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
            <figure className={CARD} aria-label="O painel, na hora">
              <figcaption className="text-xs text-ink-muted">no painel, na hora</figcaption>
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

        <section aria-labelledby="toque" className={SECTION}>
          <CalendarCheck aria-hidden className="h-7 w-7 text-accent-dark dark:text-accent-light" strokeWidth={1.75} />
          <h2 id="toque" className={`mt-3 ${H2}`}>
            Ou um toque só
          </h2>
          <p className="mt-3 max-w-xl text-ink-muted">
            Sem formulário: Feito, Dose dada, Paguei, +1 dia ou Ignorar. Tocou duas vezes, vale uma. Errou? Desfaz em 5 segundos.
          </p>
          <p className="mt-2 text-sm text-ink-muted">Exemplo com dados fictícios.</p>
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
                      <span key={label} className={`${PILL} ${index === row.actions.length - 1 ? "bg-accent text-soft-black" : "bg-line dark:bg-line-dark"}`}>
                        {label}
                      </span>
                    ))}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        </section>

        <section aria-labelledby="familia" className={SECTION}>
          <ShieldCheck aria-hidden className="h-7 w-7 text-accent-dark dark:text-accent-light" strokeWidth={1.75} />
          <h2 id="familia" className={`mt-3 ${H2}`}>
            Uma família, os seus dados
          </h2>
          <p className="mt-3 max-w-xl text-ink-muted">
            Cada família é separada das outras: ninguém de fora vê o que você cadastra. Dentro da família, cada pessoa tem a própria conta,
            e quem criou a família convida e cancela convites. As chaves que você coloca na tela do agente ficam criptografadas.
          </p>
          <p className="mt-3 text-sm text-ink-muted">
            Leia a <Link href="/privacidade" className="underline underline-offset-2">privacidade</Link> e os{" "}
            <Link href="/termos" className="underline underline-offset-2">termos</Link>. Os dois textos ainda são rascunhos.
          </p>
        </section>

        <section aria-labelledby="duvidas" className={SECTION}>
          <h2 id="duvidas" className={H2}>
            Perguntas
          </h2>
          <dl className="mt-8 grid gap-x-10 gap-y-6 md:grid-cols-2">
            {FAQ.map((item) => (
              <div key={item.q}>
                <dt className="text-lg">{item.q}</dt>
                <dd className="mt-1 text-sm text-ink-muted">{item.a}</dd>
              </div>
            ))}
          </dl>
        </section>

        <section aria-labelledby="comece" className={`${SECTION} text-center`}>
          <h2 id="comece" className={H2}>
            Comece 14 dias grátis
          </h2>
          <p className="mx-auto mt-3 max-w-md text-ink-muted">Crie a família em um minuto. Sem cartão.</p>
          <div className="mt-6 flex justify-center">
            <Link href="/cadastrar" className={PRIMARY}>
              Criar minha família · 14 dias grátis
            </Link>
          </div>
        </section>
      </main>

      <footer className="mx-auto flex w-full max-w-5xl flex-wrap items-center justify-between gap-4 border-t border-line px-5 py-8 pb-[max(2rem,env(safe-area-inset-bottom))] text-sm text-ink-muted dark:border-line-dark md:px-10">
        <p>{SITE_NAME}. Os exemplos desta página são fictícios.</p>
        <nav aria-label="Rodapé" className="flex flex-wrap items-center gap-x-5 gap-y-1">
          <Link href="/privacidade" className={`inline-flex min-h-11 items-center underline-offset-2 hover:underline ${FOCUS}`}>
            Privacidade
          </Link>
          <Link href="/termos" className={`inline-flex min-h-11 items-center underline-offset-2 hover:underline ${FOCUS}`}>
            Termos
          </Link>
          <Link href="/login" className={`inline-flex min-h-11 items-center underline-offset-2 hover:underline ${FOCUS}`}>
            Entrar
          </Link>
        </nav>
      </footer>
    </div>
  );
}
