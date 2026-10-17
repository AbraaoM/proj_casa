import { householdToday, invalid, jsonOk, requireSql, run } from "@/lib/agent/http";
import { parseMonthQuery } from "@/lib/domain/finance/validate";
import { getFinanceSummary } from "@/lib/services/finance/summary";

/** ?month=YYYY-MM. Income, expense, result, by category, balances, bills due in 30 days, budget overruns. */
export async function GET(request: Request) {
  return run(request, async () => {
    const sql = requireSql();
    const today = await householdToday(sql);
    const month = parseMonthQuery(new URL(request.url).searchParams, today);
    if (!month.ok) throw invalid(month.details);
    return jsonOk({ summary: await getFinanceSummary(sql, month.value, today) });
  });
}
