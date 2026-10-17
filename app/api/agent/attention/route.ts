import { run, jsonOk, requireSql } from "@/lib/agent/http";
import { todayInTimeZone } from "@/lib/domain/dates";
import { parseAttentionQuery } from "@/lib/domain/validate";
import { validationError } from "@/lib/errors";
import { listAttention } from "@/lib/services/attention";
import { readSettings } from "@/lib/services/settings";

export async function GET(request: Request) {
  return run(request, async () => {
    const parsed = parseAttentionQuery(new URL(request.url).searchParams);
    if (!parsed.ok) {
      throw validationError(parsed.details[0]?.message ?? "Invalid query.", parsed.details);
    }
    const sql = requireSql();
    const settings = await readSettings(sql);
    const today = todayInTimeZone(settings.timezone);
    const attention = await listAttention(sql, {
      today,
      withinDays: parsed.value.within_days,
      domain: parsed.value.domain,
    });
    return jsonOk({
      as_of: today,
      timezone: settings.timezone,
      within_days: parsed.value.within_days,
      summary: attention.summary,
      items: attention.items,
    });
  });
}
