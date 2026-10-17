import { invalid, jsonOk, readJson, requireRef, requireSql, run } from "@/lib/agent/http";
import { parseBillPatch } from "@/lib/domain/finance/validate";
import { getBillView, updateBill } from "@/lib/services/finance/bills";

type Context = { params: Promise<{ id: string }> };

/** Bill by uuid or slug, with its latest payments. */
export async function GET(request: Request, context: Context) {
  return run(request, async () => {
    const ref = await requireRef(context.params, "Bill");
    return jsonOk({ bill: await getBillView(requireSql(), ref) });
  });
}

/** Edits a bill. Confirm a suggestion with status "active"; dismiss or stop one with "ended". */
export async function PATCH(request: Request, context: Context) {
  return run(request, async () => {
    const ref = await requireRef(context.params, "Bill");
    const parsed = parseBillPatch(await readJson(request));
    if (!parsed.ok) throw invalid(parsed.details, "Invalid bill.");
    return jsonOk({ bill: await updateBill(requireSql(), ref, parsed.value) });
  });
}
