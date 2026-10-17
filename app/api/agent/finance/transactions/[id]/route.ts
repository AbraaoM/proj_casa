import { invalid, jsonOk, readJson, requireId, requireSql, run } from "@/lib/agent/http";
import { parseTransactionPatch } from "@/lib/domain/finance/validate";
import { getTransaction, updateTransaction } from "@/lib/services/finance/transactions";

type Context = { params: Promise<{ id: string }> };

export async function GET(request: Request, context: Context) {
  return run(request, async () => {
    const id = await requireId(context.params);
    return jsonOk({ transaction: await getTransaction(requireSql(), id) });
  });
}

/** Corrects or voids ({ "voided": true }). A cost mirrored from an event is corrected through the event. */
export async function PATCH(request: Request, context: Context) {
  return run(request, async () => {
    const id = await requireId(context.params);
    const parsed = parseTransactionPatch(await readJson(request));
    if (!parsed.ok) throw invalid(parsed.details, "Invalid transaction.");
    return jsonOk({ transaction: await updateTransaction(requireSql(), id, parsed.value) });
  });
}
