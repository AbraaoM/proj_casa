import { householdToday, invalid, jsonOk, readJson, requireRef, requireSql, run } from "@/lib/agent/http";
import { parseReconcile } from "@/lib/domain/finance/validate";
import { reconcileAccount } from "@/lib/services/finance/accounts";

type Context = { params: Promise<{ id: string }> };

/** {through}: clears transactions up to that date if the balance matches that day's balance check. */
export async function POST(request: Request, context: Context) {
  return run(request, async () => {
    const ref = await requireRef(context.params, "Account");
    const parsed = parseReconcile(await readJson(request));
    if (!parsed.ok) throw invalid(parsed.details, "Invalid reconcile request.");
    const sql = requireSql();
    return jsonOk(await reconcileAccount(sql, ref, parsed.value.through, await householdToday(sql)));
  });
}
