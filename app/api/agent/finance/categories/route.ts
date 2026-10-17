import { invalid, jsonOk, readJson, requireSql, run } from "@/lib/agent/http";
import { parseCategoryCreate } from "@/lib/domain/finance/validate";
import { createCategory, listCategories } from "@/lib/services/finance/categories";

/** Flat list (parents first, children after their parent) with parent_slug. */
export async function GET(request: Request) {
  return run(request, async () => {
    const includeArchived = new URL(request.url).searchParams.get("include_archived") === "1";
    return jsonOk({ categories: await listCategories(requireSql(), includeArchived) });
  });
}

/** Idempotent by slug. A subcategory (parent) inherits the parent's kind. */
export async function POST(request: Request) {
  return run(request, async () => {
    const parsed = parseCategoryCreate(await readJson(request));
    if (!parsed.ok) throw invalid(parsed.details, "Invalid category.");
    const created = await createCategory(requireSql(), parsed.value);
    return jsonOk({ category: created.category }, { idempotent_replay: created.idempotentReplay }, created.idempotentReplay ? 200 : 201);
  });
}
