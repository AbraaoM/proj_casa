import { bulkResults, invalid, readJson, requireSql, run } from "@/lib/agent/http";
import { parseTransactionCreate } from "@/lib/domain/finance/validate";
import { parseBulkBody } from "@/lib/domain/validate";
import { createTransaction } from "@/lib/services/finance/transactions";

/** Up to 50 transactions, each with its own ok. Meant for importing a statement. */
export async function POST(request: Request) {
  return run(request, async () => {
    const parsed = parseBulkBody(await readJson(request));
    if (!parsed.ok) throw invalid(parsed.details, "Invalid bulk request.");
    const sql = requireSql();
    return bulkResults(parsed.value, parseTransactionCreate, async (input) => {
      const created = await createTransaction(sql, input);
      return { data: { transactions: created.transactions }, idempotentReplay: created.idempotentReplay };
    });
  });
}
