import { invalid, jsonOk, readJson, requireSql, run } from "@/lib/agent/http";
import { BILL_STATUSES, type BillStatus } from "@/lib/domain/finance/types";
import { parseBillCreate } from "@/lib/domain/finance/validate";
import { createBill, listBills } from "@/lib/services/finance/bills";

/** ?status=active,suggested (default: all). Ordered by next due date. */
export async function GET(request: Request) {
  return run(request, async () => {
    const raw = new URL(request.url).searchParams.get("status");
    let statuses: BillStatus[] | null = null;
    if (raw) {
      const parts = raw.split(",");
      const bad = parts.filter((part) => !(BILL_STATUSES as readonly string[]).includes(part));
      if (bad.length > 0) throw invalid([{ field: "status", message: `must be among: ${BILL_STATUSES.join(", ")}` }]);
      statuses = parts as BillStatus[];
    }
    return jsonOk({ bills: await listBills(requireSql(), statuses) });
  });
}

/** Idempotent by slug and external_key. status "suggested" only when the owner has not confirmed it. */
export async function POST(request: Request) {
  return run(request, async () => {
    const parsed = parseBillCreate(await readJson(request));
    if (!parsed.ok) throw invalid(parsed.details, "Invalid bill.");
    const created = await createBill(requireSql(), parsed.value);
    return jsonOk({ bill: created.bill }, { idempotent_replay: created.idempotentReplay }, created.idempotentReplay ? 200 : 201);
  });
}
