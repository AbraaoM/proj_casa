import { householdToday, jsonOk, readJson, requireId, requireSql, run } from "@/lib/agent/http";
import { parseEventPatch } from "@/lib/domain/events";
import { validationError } from "@/lib/errors";
import { getEvent, updateEvent } from "@/lib/services/events";

type Context = { params: Promise<{ id: string }> };

export async function GET(request: Request, context: Context) {
  return run(request, async () => {
    const event = await getEvent(requireSql(), await requireId(context.params));
    return jsonOk({ event });
  });
}

/** Corrects an event. { "voided": true } hides a wrong entry without deleting it. */
export async function PATCH(request: Request, context: Context) {
  return run(request, async () => {
    const id = await requireId(context.params);
    const parsed = parseEventPatch(await readJson(request));
    if (!parsed.ok) throw validationError(parsed.details[0]?.message ?? "Invalid event.", parsed.details);
    const sql = requireSql();
    const result = await updateEvent(sql, id, parsed.value, await householdToday(sql));
    return jsonOk({ event: result.event, transaction: result.transaction }, result.notes.length > 0 ? { notes: result.notes } : {});
  });
}
