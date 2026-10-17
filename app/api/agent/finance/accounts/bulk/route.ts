import { bulkResults, householdToday, invalid, readJson, requireSql, run } from "@/lib/agent/http";
import { parseAccountCreate } from "@/lib/domain/finance/validate";
import { parseBulkBody } from "@/lib/domain/validate";
import { createAccount } from "@/lib/services/finance/accounts";

/** Up to 50 accounts, each with its own ok. */
export async function POST(request: Request) {
  return run(request, async () => {
    const parsed = parseBulkBody(await readJson(request));
    if (!parsed.ok) throw invalid(parsed.details, "Invalid bulk request.");
    const sql = requireSql();
    const today = await householdToday(sql);
    return bulkResults(parsed.value, parseAccountCreate, async (input) => {
      const created = await createAccount(sql, input, today);
      return { data: { account: created.account }, idempotentReplay: created.idempotentReplay };
    });
  });
}
