import { householdToday, invalid, jsonOk, readJson, requireSql, run } from "@/lib/agent/http";
import { parseReportDay } from "@/lib/domain/day-report";
import { parseMealCreate } from "@/lib/domain/food";
import { dayMeals, logMeal, presentDay, presentMeal } from "@/lib/services/food";

export async function GET(request: Request) {
  return run(request, async () => {
    const sql = requireSql();
    const today = await householdToday(sql);
    const parsed = parseReportDay(new URL(request.url).searchParams.get("date"), today);
    if (!parsed.ok) throw invalid(parsed.details, "Invalid day.");
    return jsonOk(presentDay(parsed.value, await dayMeals(sql, parsed.value)));
  });
}

export async function POST(request: Request) {
  return run(request, async () => {
    const sql = requireSql();
    const today = await householdToday(sql);
    const parsed = parseMealCreate(await readJson(request), today);
    if (!parsed.ok) throw invalid(parsed.details, "Invalid meal.");
    const result = await logMeal(sql, parsed.value);
    return jsonOk({ meal: presentMeal(result.meal) }, { idempotent_replay: result.idempotent_replay }, result.idempotent_replay ? 200 : 201);
  });
}
