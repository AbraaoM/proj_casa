import { invalid, jsonOk, readJson, requireSql, run } from "@/lib/agent/http";
import { parseDishCreate } from "@/lib/domain/food";
import { createDish, listDishes, presentDish } from "@/lib/services/food";

export async function GET(request: Request) {
  return run(request, async () => {
    const includeArchived = new URL(request.url).searchParams.get("include_archived") === "1";
    const dishes = await listDishes(requireSql(), includeArchived);
    return jsonOk({ dishes: dishes.map(presentDish) });
  });
}

export async function POST(request: Request) {
  return run(request, async () => {
    const parsed = parseDishCreate(await readJson(request));
    if (!parsed.ok) throw invalid(parsed.details, "Invalid dish.");
    const result = await createDish(requireSql(), parsed.value);
    return jsonOk({ dish: presentDish(result.dish) }, { idempotent_replay: result.idempotent_replay }, result.idempotent_replay ? 200 : 201);
  });
}
