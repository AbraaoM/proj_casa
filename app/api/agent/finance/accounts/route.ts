import { householdToday, invalid, jsonOk, readJson, requireSql, run } from "@/lib/agent/http";
import { parseAccountCreate } from "@/lib/domain/finance/validate";
import { netWorth } from "@/lib/domain/finance/money";
import { createAccount, listAccountViews } from "@/lib/services/finance/accounts";

/** Accounts with today's balance. ?include_archived=1 lists archived ones too. */
export async function GET(request: Request) {
  return run(request, async () => {
    const sql = requireSql();
    const includeArchived = new URL(request.url).searchParams.get("include_archived") === "1";
    const accounts = await listAccountViews(sql, await householdToday(sql), includeArchived);
    return jsonOk({ accounts, net_worth: netWorth(accounts.filter((account) => !account.archived_at)) });
  });
}

/** Idempotent by slug: an existing slug comes back untouched with meta.idempotent_replay. */
export async function POST(request: Request) {
  return run(request, async () => {
    const parsed = parseAccountCreate(await readJson(request));
    if (!parsed.ok) throw invalid(parsed.details, "Invalid account.");
    const sql = requireSql();
    const created = await createAccount(sql, parsed.value, await householdToday(sql));
    return jsonOk({ account: created.account }, { idempotent_replay: created.idempotentReplay }, created.idempotentReplay ? 200 : 201);
  });
}
