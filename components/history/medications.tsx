import { localDay, localTime } from "@/lib/domain/doses";
import type { MedicationView } from "@/lib/services/doses";
import { dayWord, intervalPhrase, untilPhrase } from "@/lib/ui/doses";
import { formatDate } from "@/lib/ui/format";

/** Medication with a schedule in hours: next dose up top, doses of the last 48 h below. */
export function Medications({ medications, today }: { medications: MedicationView[]; today: string }) {
  if (medications.length === 0) return null;
  return (
    <section aria-labelledby="remedios" className="mt-10 border-t border-line pt-4 dark:border-line-dark">
      <div className="flex items-baseline justify-between gap-4">
        <h2 id="remedios" className="text-lg">
          Remédios
        </h2>
        <p className="font-display text-2xl leading-none">{medications.length}</p>
      </div>
      <div className="mt-6 grid grid-cols-1 gap-x-10 gap-y-10 md:grid-cols-2 xl:grid-cols-3">
        {medications.map((medication) => (
          <MedicationCard key={medication.item.id} medication={medication} today={today} />
        ))}
      </div>
    </section>
  );
}

function MedicationCard({ medication, today }: { medication: MedicationView; today: string }) {
  const { item, doses, late, next_due_time, next_due_day, minutes_until_next, timezone } = medication;
  const meta = [item.interval_hours ? intervalPhrase(item.interval_hours) : null, item.ends_on ? `até ${formatDate(item.ends_on).replace(/ \d{4}$/, "")}` : null]
    .filter(Boolean)
    .join(" · ");

  return (
    <article className="min-w-0">
      <h3 className="text-base">{item.title}</h3>
      {meta ? <p className="mt-1 text-sm text-ink-muted">{meta}</p> : null}

      <div
        className={`mt-4 border-l-2 pl-3 transition-colors duration-300 ${
          late ? "border-black dark:border-white" : "border-accent"
        }`}
      >
        <p className={`text-xs uppercase tracking-wider ${late ? "text-black dark:text-white" : "text-accent-dark dark:text-accent-light"}`}>
          {next_due_time ? (late ? "Dose atrasada" : "Próxima dose") : "Próxima dose"}
        </p>
        {next_due_time && next_due_day ? (
          <>
            <p className="mt-1 font-display text-5xl leading-none tracking-tight tabular-nums">{next_due_time}</p>
            <p className="mt-2 text-sm text-ink-muted">
              {next_due_day !== today ? `${dayWord(next_due_day, today)} · ` : ""}
              {minutes_until_next !== null ? untilPhrase(minutes_until_next) : ""}
            </p>
          </>
        ) : (
          <p className="mt-1 text-sm text-ink-muted">Sem dose registrada ainda. O James registra.</p>
        )}
      </div>

      {doses.length > 0 ? (
        <ol className="mt-5" aria-label={`Doses de ${item.title}`}>
          {doses.map((dose) => {
            const at = dose.done_at as string;
            return (
              <li
                key={dose.id}
                className="grid grid-cols-[4rem_1fr] gap-x-3 border-t border-line py-3 first:border-t-0 dark:border-line-dark"
              >
                <p className="font-display text-xl leading-none tabular-nums">{localTime(at, timezone)}</p>
                <div className="min-w-0 text-sm text-ink-muted">
                  <span>{dayWord(localDay(at, timezone), today)}</span>
                  {dose.notes ? <span> · {dose.notes}</span> : null}
                </div>
              </li>
            );
          })}
        </ol>
      ) : null}
    </article>
  );
}
