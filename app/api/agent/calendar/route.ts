import { jsonOk, requireSql, run } from "@/lib/agent/http";
import { parseWithinDays } from "@/lib/domain/calendar";
import { todayInTimeZone } from "@/lib/domain/dates";
import { validationError } from "@/lib/errors";
import { listHouseholdAgenda } from "@/lib/services/google-calendar";
import { readSettings } from "@/lib/services/settings";

/** Upcoming events from every connected Google Agenda, next 14 days unless within_days says otherwise. */
export async function GET(request: Request) {
  return run(request, async () => {
    const params = new URL(request.url).searchParams;
    const parsed = parseWithinDays(params.get("within_days"));
    if (!parsed.ok) throw validationError(parsed.details[0]?.message ?? "Invalid query.", parsed.details);
    const sql = requireSql();
    const settings = await readSettings(sql);
    const data = await listHouseholdAgenda(sql, {
      today: todayInTimeZone(settings.timezone),
      timeZone: settings.timezone,
      withinDays: parsed.value,
    });
    return jsonOk(data, { within_days: parsed.value, timezone: settings.timezone });
  });
}
