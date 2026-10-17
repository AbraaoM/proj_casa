import { householdToday, invalid, jsonOk, readJson, requireRef, requireSql, run } from "@/lib/agent/http";
import { parseAccountPatch } from "@/lib/domain/finance/validate";
import { getAccountView, updateAccount } from "@/lib/services/finance/accounts";

type Context = { params: Promise<{ id: string }> };

/** Account by uuid or slug, with balance, last balance check and (cards) the open statement. */
export async function GET(request: Request, context: Context) {
  return run(request, async () => {
    const ref = await requireRef(context.params, "Account");
    const sql = requireSql();
    return jsonOk({ account: await getAccountView(sql, ref, await householdToday(sql)) });
  });
}

/** Edits an account. { "archived": true } hides it without deleting its history. */
export async function PATCH(request: Request, context: Context) {
  return run(request, async () => {
    const ref = await requireRef(context.params, "Account");
    const parsed = parseAccountPatch(await readJson(request));
    if (!parsed.ok) throw invalid(parsed.details, "Invalid account.");
    const sql = requireSql();
    return jsonOk({ account: await updateAccount(sql, ref, parsed.value, await householdToday(sql)) });
  });
}
