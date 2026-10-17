import { householdToday, invalid, jsonOk, readJson, requireRef, requireSql, run } from "@/lib/agent/http";
import { parseBalanceCheck } from "@/lib/domain/finance/validate";
import { addBalanceCheck } from "@/lib/services/finance/accounts";

type Context = { params: Promise<{ id: string }> };

/** Records the real balance on a date ({date, balance_cents}); the response shows the difference. */
export async function POST(request: Request, context: Context) {
  return run(request, async () => {
    const ref = await requireRef(context.params, "Account");
    const parsed = parseBalanceCheck(await readJson(request));
    if (!parsed.ok) throw invalid(parsed.details, "Invalid balance check.");
    const sql = requireSql();
    const result = await addBalanceCheck(sql, ref, parsed.value, await householdToday(sql));
    return jsonOk(
      { balance_check: result.check, account: result.account },
      { idempotent_replay: result.idempotentReplay },
      result.idempotentReplay ? 200 : 201,
    );
  });
}
