import type { Sheet } from "@/lib/domain/routine";

const WEEKDAY = ["dom", "seg", "ter", "qua", "qui", "sex", "sáb"];

function dayParts(iso: string) {
  const date = new Date(`${iso}T12:00:00Z`);
  return { day: iso.slice(8, 10), month: iso.slice(5, 7), weekday: WEEKDAY[date.getUTCDay()]! };
}

/**
 * The folha de registro, read-only: one row per routine, one column per day, a mark where it was done.
 * Oldest day on the left, today on the right; on a phone it opens scrolled to the newest days.
 */
export function RoutineSheet({ sheet, today }: { sheet: Sheet; today: string }) {
  if (sheet.rows.length === 0) return null;
  return (
    <section className="mt-12 border-t border-line pt-4 dark:border-line-dark" aria-labelledby="folha">
      <div className="flex items-baseline justify-between gap-4">
        <h2 id="folha" className="text-lg">Folha de registro</h2>
        <p className="text-sm text-ink-faint">últimos {sheet.days.length} dias</p>
      </div>
      <p className="mt-1 text-sm text-ink-muted">Cada marca é um registro: quem fez e a hora. Para corrigir, fale com seu agente.</p>
      {/* rtl wrapper: the scroll starts at the right edge, so the newest days show first. */}
      <div className="mt-5 overflow-x-auto [direction:rtl]">
        <table className="border-separate border-spacing-0 text-sm [direction:ltr]">
          <thead>
            <tr>
              <th scope="col" className="sticky left-0 z-10 min-w-36 bg-soft-white pr-3 text-left align-bottom text-xs font-normal uppercase tracking-wider text-ink-muted dark:bg-soft-black">
                Tarefa
              </th>
              {sheet.days.map((iso) => {
                const { day, month, weekday } = dayParts(iso);
                const isToday = iso === today;
                return (
                  <th key={iso} scope="col" className={`w-10 min-w-10 px-0.5 pb-2 text-center align-bottom font-normal ${isToday ? "text-accent-dark dark:text-accent-light" : "text-ink-faint"}`}>
                    <span className="block text-[10px] uppercase">{weekday}</span>
                    <span className={`block text-xs ${isToday ? "font-semibold" : ""}`}>{day}</span>
                    {day === "01" || iso === sheet.days[0] ? <span className="block text-[10px]">/{month}</span> : null}
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {sheet.rows.map((row) => (
              <tr key={row.id}>
                <th scope="row" className="sticky left-0 z-10 max-w-44 truncate border-t border-line bg-soft-white py-2 pr-3 text-left font-normal dark:border-line-dark dark:bg-soft-black">
                  {row.title}
                </th>
                {row.cells.map((cell) => {
                  const done = cell.marks.length > 0;
                  const title = done
                    ? cell.marks.map((mark) => [mark.by, mark.time, mark.notes].filter(Boolean).join(" · ")).join("\n")
                    : undefined;
                  return (
                    <td key={cell.day} className={`border-t border-line px-0.5 py-1.5 text-center dark:border-line-dark ${cell.day === today ? "bg-accent/5" : ""}`}>
                      {done ? (
                        <span
                          title={title}
                          aria-label={`${row.title}, ${cell.day}: feito por ${title}`}
                          className="mx-auto flex h-7 w-7 items-center justify-center rounded-full bg-accent text-[11px] font-semibold text-soft-black"
                        >
                          {cell.marks.length > 1 ? cell.marks.length : "✓"}
                        </span>
                      ) : (
                        <span aria-hidden className="mx-auto block h-1 w-1 rounded-full bg-line dark:bg-line-dark" />
                      )}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
