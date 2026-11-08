import { householdToday, invalid, jsonOk, readJson, requireSql, run } from "@/lib/agent/http";
import { parseStockCreate } from "@/lib/domain/food";
import { createStock, listStock, presentStock } from "@/lib/services/food";

export async function GET(request: Request) {
  return run(request, async () => {
    const sql = requireSql();
    const today = await householdToday(sql);
    const includeArchived = new URL(request.url).searchParams.get("include_archived") === "1";
    const items = await listStock(sql, today, includeArchived);
    return jsonOk({ items: items.map(presentStock) });
  });
}

export async function POST(request: Request) {
  return run(request, async () => {
    const sql = requireSql();
    const today = await householdToday(sql);
    const parsed = parseStockCreate(await readJson(request));
    if (!parsed.ok) throw invalid(parsed.details, "Invalid food item.");
    const result = await createStock(sql, parsed.value, today);
    return jsonOk({ item: presentStock(result.item), taco_candidates: result.taco_candidates }, { idempotent_replay: result.idempotent_replay }, result.idempotent_replay ? 200 : 201);
  });
}
