import { AgendaConnectLink } from "@/components/agenda/connect-link";
import { BotActionButton } from "@/components/agents/bot-forms";
import { PageNotice } from "@/components/history/page-notice";
import { currentUser } from "@/lib/auth/session";
import { tryGetSql } from "@/lib/db/client";
import { isMissingSchema } from "@/lib/db/errors";
import type { AgendaEvent } from "@/lib/domain/calendar";
import { disconnectGoogleAgendaAction } from "@/lib/google/actions";
import { listHouseholdAgenda, loadAgendaLink, type AgendaNotice } from "@/lib/services/google-calendar";
import { readSettings } from "@/lib/services/settings";
import { todayInTimeZone } from "@/lib/domain/dates";
import { agendaDayKey, agendaDayLabel, agendaTimeLabel } from "@/lib/ui/agenda";

export const dynamic = "force-dynamic";

const NOTICES: Partial<Record<AgendaNotice, string>> = {
  connected: "Google Agenda conectada.",
  unconfigured: "Falta GOOGLE_CLIENT_ID e GOOGLE_CLIENT_SECRET no servidor.",
  secret: "Falta CASA_SECRET_KEY para guardar a conexão.",
  failed: "Não consegui ler a agenda.",
};

type Props = { searchParams: Promise<{ agenda?: string }> };

export default async function AgendaPage({ searchParams }: Props) {
  const { agenda: noticeKey } = await searchParams;
  const user = await currentUser();
  const sql = tryGetSql();
  if (!user || !sql) return <PageNotice status="unconfigured" />;
  let link;
  try {
    link = await loadAgendaLink(sql, user.id);
  } catch (error) {
    if (isMissingSchema(error)) return <PageNotice status="schema_missing" />;
    return <PageNotice status="error" />;
  }
  if (link.schema === "missing") return <PageNotice status="schema_missing" />;

  let events: AgendaEvent[] = [];
  let warnings: string[] = [];
  let timeZone = "America/Sao_Paulo";
  try {
    const settings = await readSettings(sql);
    timeZone = settings.timezone;
    const snapshot = await listHouseholdAgenda(sql, { today: todayInTimeZone(timeZone), timeZone, withinDays: 14 });
    events = snapshot.events;
    warnings = snapshot.warnings;
  } catch (error) {
    if (isMissingSchema(error)) return <PageNotice status="schema_missing" />;
    warnings = ["Não consegui ler a agenda agora."];
  }

  const groups = groupByDay(events, timeZone);
  const notice = noticeKey && noticeKey in NOTICES ? NOTICES[noticeKey as AgendaNotice] : null;

  return (
    <main className="mx-auto w-full max-w-3xl px-5 py-8 md:max-w-5xl md:px-10 md:py-12">
      <h1 className="font-display text-5xl leading-none tracking-tight">Agenda</h1>
      <p className="mt-3 max-w-xl text-sm text-ink-muted">
        Os próximos 14 dias do Google Agenda de quem conectou a própria conta. Para marcar um horário, peça ao seu agente.
      </p>
      {notice ? <p className="mt-4 text-sm text-accent">{notice}</p> : null}
      {!link.configured && !link.connected ? <p className="mt-4 max-w-xl text-sm text-ink-muted">{NOTICES.unconfigured}</p> : null}

      <div className="mt-6 flex flex-wrap items-center gap-3">
        {link.connected ? (
          <>
            <p className="text-sm text-ink-muted">Conectada{link.email ? ` como ${link.email}` : ""}.</p>
            <BotActionButton action={disconnectGoogleAgendaAction} label="Desconectar" pendingLabel="Desconectando…" quiet />
          </>
        ) : (
          <AgendaConnectLink disabled={!link.configured} />
        )}
      </div>

      {warnings.map((warning) => (
        <p key={warning} className="mt-4 text-sm text-ink-muted">{warning}</p>
      ))}

      {groups.length === 0 ? (
        <p className="mt-10 text-sm text-ink-muted">Nada nos próximos 14 dias.</p>
      ) : (
        <div className="mt-10 space-y-8">
          {groups.map((group) => (
            <section key={group.day}>
              <h2 className="text-lg">{group.label}</h2>
              <ul className="mt-3">
                {group.events.map((event) => (
                  <li key={`${event.owner}-${event.id}`} className="border-b border-line py-4 dark:border-line-dark">
                    <p className="text-base">
                      {event.html_link ? (
                        <a href={event.html_link} className="underline-offset-4 hover:underline" target="_blank" rel="noreferrer">
                          {event.title}
                        </a>
                      ) : event.title}
                    </p>
                    <p className="mt-1 text-sm text-ink-muted">
                      {agendaTimeLabel(event, timeZone)}
                      {" · "}
                      {event.owner}
                      {event.location ? ` · ${event.location}` : ""}
                    </p>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}
    </main>
  );
}

function groupByDay(events: AgendaEvent[], timeZone: string): Array<{ day: string; label: string; events: AgendaEvent[] }> {
  const groups: Array<{ day: string; label: string; events: AgendaEvent[] }> = [];
  for (const event of events) {
    const day = agendaDayKey(event, timeZone);
    const last = groups[groups.length - 1];
    if (last && last.day === day) last.events.push(event);
    else groups.push({ day, label: agendaDayLabel(day, timeZone), events: [event] });
  }
  return groups;
}
