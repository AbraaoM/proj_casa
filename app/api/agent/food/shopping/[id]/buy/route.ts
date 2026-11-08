import { invalid, jsonOk, readJson, requireId, requireSql, run } from "@/lib/agent/http";
import { parseRestock } from "@/lib/domain/food";
import { buyShopping, presentShopping } from "@/lib/services/food";

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  return run(request, async () => {
    const parsed = parseRestock(await readJson(request));
    if (!parsed.ok) throw invalid(parsed.details, "Invalid buy.");
    const result = await buyShopping(requireSql(), await requireId(context.params), parsed.value.restock);
    return jsonOk({ line: presentShopping(result.line), already: result.already });
  });
}
