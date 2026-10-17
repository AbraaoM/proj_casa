import { householdToday, jsonOk, requireId, requireSql, run } from "@/lib/agent/http";
import { getSubjectHistory } from "@/lib/services/history";
import { householdClock } from "@/lib/services/settings";

type Context = { params: Promise<{ id: string }> };

/** Active items, live events (newest first, up to 200) and a summary. */
export async function GET(request: Request, context: Context) {
  return run(request, async () => {
    const ref = await requireId(context.params);
    const sql = requireSql();
    const history = await getSubjectHistory(sql, "vehicle", ref, await householdToday(sql), await householdClock(sql));
    return jsonOk(history);
  });
}
