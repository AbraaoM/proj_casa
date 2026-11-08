import { jsonOk, requireId, requireSql, run } from "@/lib/agent/http";
import { cancelMeal } from "@/lib/services/food";

/** Voids a meal. The row stays, and its external_key is freed so the same call can record a new one. */
export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  return run(request, async () => {
    const result = await cancelMeal(requireSql(), await requireId(context.params));
    return jsonOk(result);
  });
}
