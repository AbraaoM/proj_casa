import { errorBody, householdToday, jsonOk, readJson, requireSql, run } from "@/lib/agent/http";
import { parseCreateEvent } from "@/lib/domain/events";
import { parseBulkBody } from "@/lib/domain/validate";
import { validationError } from "@/lib/errors";
import { createEvent } from "@/lib/services/events";

/** Up to 50 events, each with its own ok. Meant for importing past history. */
export async function POST(request: Request) {
  return run(request, async () => {
    const parsed = parseBulkBody(await readJson(request));
    if (!parsed.ok) throw validationError(parsed.details[0]?.message ?? "Invalid bulk request.", parsed.details);
    const sql = requireSql();
    const today = await householdToday(sql);
    const results = [];
    for (let index = 0; index < parsed.value.length; index += 1) {
      const event = parseCreateEvent(parsed.value[index]);
      if (!event.ok) {
        results.push({
          index,
          ok: false,
          error: { code: "validation_error", message: event.details[0]?.message ?? "Invalid event.", details: event.details },
        });
        continue;
      }
      try {
        const created = await createEvent(sql, event.value, today);
        results.push({
          index,
          ok: true,
          data: { event: created.event, item: created.item },
          meta: { idempotent_replay: created.idempotentReplay },
        });
      } catch (error) {
        const body = errorBody(error);
        if (body.code === "internal_error") console.error(error);
        results.push({ index, ok: false, error: body });
      }
    }
    const succeeded = results.filter((result) => result.ok).length;
    return jsonOk({ results }, { succeeded, failed: results.length - succeeded });
  });
}
