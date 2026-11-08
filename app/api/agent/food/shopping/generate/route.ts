import { householdToday, jsonOk, requireSql, run } from "@/lib/agent/http";
import { generateShopping, presentShopping } from "@/lib/services/food";

/** Adds open lines for stock that is at or under its minimum. An item already on the list is skipped. */
export async function POST(request: Request) {
  return run(request, async () => {
    const sql = requireSql();
    const today = await householdToday(sql);
    const result = await generateShopping(sql, today);
    return jsonOk({ added: result.added.map(presentShopping) });
  });
}
