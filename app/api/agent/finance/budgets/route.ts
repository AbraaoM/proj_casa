import { householdToday, invalid, jsonOk, readJson, requireSql, run } from "@/lib/agent/http";
import { parseBudgetPut, parseMonthQuery } from "@/lib/domain/finance/validate";
import { getBudgetView, putBudgets } from "@/lib/services/finance/budgets";

/** ?month=YYYY-MM (default: this month). Budget against spending, with 6-month trend. */
export async function GET(request: Request) {
  return run(request, async () => {
    const sql = requireSql();
    const month = parseMonthQuery(new URL(request.url).searchParams, await householdToday(sql));
    if (!month.ok) throw invalid(month.details);
    return jsonOk({ budget: await getBudgetView(sql, month.value) });
  });
}

/** {month?: "YYYY-MM" | null, items: [{category, amount_cents | null}]}. month null sets the default budget. */
export async function PUT(request: Request) {
  return run(request, async () => {
    const parsed = parseBudgetPut(await readJson(request));
    if (!parsed.ok) throw invalid(parsed.details, "Invalid budget.");
    const sql = requireSql();
    return jsonOk({ budget: await putBudgets(sql, parsed.value, await householdToday(sql)) });
  });
}
