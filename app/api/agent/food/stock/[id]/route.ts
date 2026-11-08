import { householdToday, invalid, jsonOk, readJson, requireRef, requireSql, run } from "@/lib/agent/http";
import { parseStockPatch } from "@/lib/domain/food";
import { presentStock, readStock, updateStock } from "@/lib/services/food";

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  return run(request, async () => {
    const sql = requireSql();
    const today = await householdToday(sql);
    const item = await readStock(sql, await requireRef(context.params, "Food item"), today);
    return jsonOk({ item: presentStock(item) });
  });
}

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  return run(request, async () => {
    const sql = requireSql();
    const today = await householdToday(sql);
    const parsed = parseStockPatch(await readJson(request));
    if (!parsed.ok) throw invalid(parsed.details, "Invalid food item.");
    const item = await updateStock(sql, await requireRef(context.params, "Food item"), parsed.value, today);
    return jsonOk({ item: presentStock(item) });
  });
}
