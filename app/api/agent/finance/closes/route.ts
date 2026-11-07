import { householdToday, invalid, jsonOk, readJson, requireSql, run } from "@/lib/agent/http";
import { parseCloseBody } from "@/lib/domain/finance/close";
import { closeMonth } from "@/lib/services/finance/close";

/** Closes the month that just ended, or the month in the body. refresh true rebuilds the snapshot. */
export async function POST(request: Request) {
  return run(request, async () => {
    const sql = requireSql();
    const today = await householdToday(sql);
    const parsed = parseCloseBody(await readJson(request), today);
    if (!parsed.ok) throw invalid(parsed.details, "Invalid close.");
    const result = await closeMonth(sql, parsed.value.month, today, parsed.value.refresh);
    return jsonOk({ ...result.close, already_closed: result.already, pdf_path: `/api/agent/finance/closes/${result.close.month}/pdf` });
  });
}
