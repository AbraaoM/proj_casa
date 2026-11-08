import { invalid, jsonOk, readJson, requireRef, requireSql, run } from "@/lib/agent/http";
import { parseDishPatch } from "@/lib/domain/food";
import { presentDish, readDish, updateDish } from "@/lib/services/food";

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  return run(request, async () => {
    const dish = await readDish(requireSql(), await requireRef(context.params, "Dish"));
    return jsonOk({ dish: presentDish(dish) });
  });
}

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  return run(request, async () => {
    const parsed = parseDishPatch(await readJson(request));
    if (!parsed.ok) throw invalid(parsed.details, "Invalid dish.");
    const dish = await updateDish(requireSql(), await requireRef(context.params, "Dish"), parsed.value);
    return jsonOk({ dish: presentDish(dish) });
  });
}
