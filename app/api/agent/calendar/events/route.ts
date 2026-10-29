import { jsonOk, readJson, requireSql, run } from "@/lib/agent/http";
import { parseAgendaCreate } from "@/lib/domain/calendar";
import { validationError } from "@/lib/errors";
import { createAgendaEvent } from "@/lib/services/google-calendar";
import { readSettings } from "@/lib/services/settings";

/** Creates an event on the caller's own Google Agenda. Repeating external_key returns the first event. */
export async function POST(request: Request) {
  return run(request, async () => {
    const sql = requireSql();
    const settings = await readSettings(sql);
    const parsed = parseAgendaCreate(await readJson(request), settings.timezone);
    if (!parsed.ok) throw validationError(parsed.details[0]?.message ?? "Invalid event.", parsed.details);
    const created = await createAgendaEvent(sql, parsed.value, settings.timezone);
    return jsonOk({ event: created.event }, { idempotent_replay: created.idempotentReplay }, created.idempotentReplay ? 200 : 201);
  });
}
