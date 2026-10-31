import { jsonOk, requireSql, run } from "@/lib/agent/http";
import { todayInTimeZone } from "@/lib/domain/dates";
import { parseReportDay } from "@/lib/domain/day-report";
import { validationError } from "@/lib/errors";
import { loadDayReport } from "@/lib/services/day-report";
import { readSettings } from "@/lib/services/settings";

/** Who did tasks, payments and checklist on a day. Live read; date defaults to today. */
export async function GET(request: Request) {
  return run(request, async () => {
    const sql = requireSql();
    const settings = await readSettings(sql);
    const today = todayInTimeZone(settings.timezone);
    const parsed = parseReportDay(new URL(request.url).searchParams.get("date"), today);
    if (!parsed.ok) throw validationError(parsed.details[0]?.message ?? "Invalid date.", parsed.details);
    const report = await loadDayReport(sql, { day: parsed.value, timeZone: settings.timezone });
    return jsonOk({ ...report, timezone: settings.timezone });
  });
}
