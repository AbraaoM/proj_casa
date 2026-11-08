import { invalid, jsonOk, run } from "@/lib/agent/http";
import { resolveTaco, searchTaco } from "@/lib/domain/food/taco";

/** Read-only TACO lookup. No database. q is the food name the person said. */
export async function GET(request: Request) {
  return run(request, async () => {
    const params = new URL(request.url).searchParams;
    const query = params.get("q")?.trim() ?? "";
    if (!query || query.length > 80) throw invalid([{ field: "q", message: "is required" }], "q is required.");
    const limitRaw = params.get("limit");
    let limit = 5;
    if (limitRaw !== null) {
      const parsed = Number(limitRaw);
      if (!Number.isInteger(parsed) || parsed < 1 || parsed > 10) {
        throw invalid([{ field: "limit", message: "must be an integer from 1 to 10" }]);
      }
      limit = parsed;
    }
    return jsonOk({
      query,
      stock: resolveTaco(query, "stock").choice,
      dish: resolveTaco(query, "dish").choice,
      candidates: searchTaco(query, limit),
    });
  });
}
