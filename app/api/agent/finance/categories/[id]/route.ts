import { invalid, jsonOk, readJson, requireRef, requireSql, run } from "@/lib/agent/http";
import { parseCategoryPatch } from "@/lib/domain/finance/validate";
import { getCategory, updateCategory } from "@/lib/services/finance/categories";

type Context = { params: Promise<{ id: string }> };

export async function GET(request: Request, context: Context) {
  return run(request, async () => {
    const ref = await requireRef(context.params, "Category");
    return jsonOk({ category: await getCategory(requireSql(), ref) });
  });
}

/** Renames, moves under a parent, or archives ({ "archived": true }). */
export async function PATCH(request: Request, context: Context) {
  return run(request, async () => {
    const ref = await requireRef(context.params, "Category");
    const parsed = parseCategoryPatch(await readJson(request));
    if (!parsed.ok) throw invalid(parsed.details, "Invalid category.");
    return jsonOk({ category: await updateCategory(requireSql(), ref, parsed.value) });
  });
}
