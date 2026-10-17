import { bulkResults, invalid, readJson, requireSql, run } from "@/lib/agent/http";
import { parseBillCreate } from "@/lib/domain/finance/validate";
import { parseBulkBody } from "@/lib/domain/validate";
import { createBill } from "@/lib/services/finance/bills";

/** Up to 50 bills, each with its own ok. Idempotent per entry by slug and external_key. */
export async function POST(request: Request) {
  return run(request, async () => {
    const parsed = parseBulkBody(await readJson(request));
    if (!parsed.ok) throw invalid(parsed.details, "Invalid bulk request.");
    const sql = requireSql();
    return bulkResults(parsed.value, parseBillCreate, async (input) => {
      const created = await createBill(sql, input);
      return { data: { bill: created.bill }, idempotentReplay: created.idempotentReplay };
    });
  });
}
