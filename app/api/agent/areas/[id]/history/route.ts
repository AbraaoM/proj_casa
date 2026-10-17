import { householdToday, jsonOk, requireAreaRef, requireSql, run } from "@/lib/agent/http";
import { getSubjectHistory } from "@/lib/services/history";

type Context = { params: Promise<{ id: string }> };

/** Active items, live events (newest first, up to 200) and a summary. */
export async function GET(request: Request, context: Context) {
  return run(request, async () => {
    const ref = await requireAreaRef(context.params);
    const sql = requireSql();
    const history = await getSubjectHistory(sql, "area", ref, await householdToday(sql));
    return jsonOk(history);
  });
}
