import { householdToday, jsonOk, readJson, requireSql, run } from "@/lib/agent/http";
import { parseCreateEvent, parseEventListQuery } from "@/lib/domain/events";
import { validationError } from "@/lib/errors";
import { createEvent, listEvents } from "@/lib/services/events";

export async function GET(request: Request) {
  return run(request, async () => {
    const parsed = parseEventListQuery(new URL(request.url).searchParams);
    if (!parsed.ok) throw validationError(parsed.details[0]?.message ?? "Invalid query.", parsed.details);
    const events = await listEvents(requireSql(), parsed.value);
    const full = events.length === parsed.value.limit;
    return jsonOk(
      { events },
      {
        count: events.length,
        limit: parsed.value.limit,
        offset: parsed.value.offset,
        next_offset: full ? parsed.value.offset + parsed.value.limit : null,
      },
    );
  });
}

/** Records something that was done. With care_item_id it is the same as POST /items/:id/done. */
export async function POST(request: Request) {
  return run(request, async () => {
    const parsed = parseCreateEvent(await readJson(request));
    if (!parsed.ok) throw validationError(parsed.details[0]?.message ?? "Invalid event.", parsed.details);
    const sql = requireSql();
    const result = await createEvent(sql, parsed.value, await householdToday(sql));
    return jsonOk(
      { event: result.event, item: result.item },
      { idempotent_replay: result.idempotentReplay },
      result.idempotentReplay ? 200 : 201,
    );
  });
}
