import { run, jsonOk, requireSql } from "@/lib/agent/http";
import { todayInTimeZone } from "@/lib/domain/dates";
import { ROUTINE_KIT } from "@/lib/domain/routine-kit";
import { parseRoutineQuery } from "@/lib/domain/validate";
import { validationError } from "@/lib/errors";
import { compactRoutine, listRoutines } from "@/lib/services/routines";
import { readSettings } from "@/lib/services/settings";

/** The house checklist (same data as the rotinas_casa tool), most urgent first. */
export async function GET(request: Request) {
  return run(request, async () => {
    const params = new URL(request.url).searchParams;
    const includeKit = params.get("include_kit") === "true";
    params.delete("include_kit");
    const parsed = parseRoutineQuery(params);
    if (!parsed.ok) throw validationError(parsed.details[0]?.message ?? "Invalid query.", parsed.details);
    const sql = requireSql();
    const settings = await readSettings(sql);
    const today = todayInTimeZone(settings.timezone);
    const routines = await listRoutines(sql, { ...parsed.value, today, timeZone: settings.timezone });
    return jsonOk({
      as_of: today,
      routines: routines.map(compactRoutine),
      ...(includeKit ? { suggested_kit: ROUTINE_KIT } : {}),
    });
  });
}
