import { householdToday, invalid, jsonOk, readJson, requireRef, requireSql, run } from "@/lib/agent/http";
import { parsePay } from "@/lib/domain/finance/validate";
import { payBill } from "@/lib/services/finance/bills";

type Context = { params: Promise<{ id: string }> };

/** {paid_on?, amount_cents?, account?, notes?, external_key?}: records the payment and moves to the next due date. */
export async function POST(request: Request, context: Context) {
  return run(request, async () => {
    const ref = await requireRef(context.params, "Bill");
    const parsed = parsePay(await readJson(request));
    if (!parsed.ok) throw invalid(parsed.details, "Invalid payment.");
    const sql = requireSql();
    const paid = await payBill(sql, ref, parsed.value, await householdToday(sql));
    return jsonOk(
      { bill: paid.bill, item: paid.item, event: paid.event, transaction: paid.transaction },
      { idempotent_replay: paid.idempotentReplay },
      paid.idempotentReplay ? 200 : 201,
    );
  });
}
