import { jsonOk, readJson, requireId, requireSql, run } from "@/lib/agent/http";
import { isIsoDate } from "@/lib/domain/dates";
import { parseDoseBody, resolveGivenAt } from "@/lib/domain/doses";
import { validationError, type FieldError } from "@/lib/errors";
import { getItemDoses, recordDose, sqlDoseStore } from "@/lib/services/doses";
import { householdClock } from "@/lib/services/settings";

type Context = { params: Promise<{ id: string }> };

/**
 * Doses of an hourly item (newest first) and the next one.
 * ?from=&to= take a date (household day) or a date-time. ?include_voided=true shows voided doses.
 */
export async function GET(request: Request, context: Context) {
  return run(request, async () => {
    const id = await requireId(context.params);
    const sql = requireSql();
    const clock = await householdClock(sql);
    const params = new URL(request.url).searchParams;
    const details: FieldError[] = [];
    const bound = (field: "from" | "to") => {
      const raw = params.get(field);
      if (!raw) return null;
      const text = isIsoDate(raw) ? `${raw}T${field === "from" ? "00:00" : "23:59:59"}` : raw;
      const resolved = resolveGivenAt(text, clock.timeZone, new Date(clock.now));
      if (!resolved) details.push({ field, message: "must be a date or an ISO date-time" });
      return resolved;
    };
    const from = bound("from");
    const to = bound("to");
    const limitRaw = params.get("limit");
    const limit = limitRaw === null ? 100 : Number(limitRaw);
    if (!Number.isInteger(limit) || limit < 1 || limit > 500) {
      details.push({ field: "limit", message: "must be an integer from 1 to 500" });
    }
    if (details.length > 0) throw validationError(details[0]?.message ?? "Invalid query.", details);
    const view = await getItemDoses(sql, id, { from, to, include_voided: params.get("include_voided") === "true", limit }, clock);
    return jsonOk(view, { count: view.doses.length, timezone: clock.timeZone, as_of: clock.now });
  });
}

/** Records a dose given at a time, without completing the item. */
export async function POST(request: Request, context: Context) {
  return run(request, async () => {
    const id = await requireId(context.params);
    const parsed = parseDoseBody(await readJson(request));
    if (!parsed.ok) throw validationError(parsed.details[0]?.message ?? "Invalid dose.", parsed.details);
    const sql = requireSql();
    const clock = await householdClock(sql);
    const result = await recordDose(sqlDoseStore(sql), id, parsed.value, clock);
    return jsonOk(
      { item: result.item, event: result.event },
      { idempotent_replay: result.idempotentReplay, timezone: clock.timeZone },
      result.idempotentReplay ? 200 : 201,
    );
  });
}
