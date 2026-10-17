import { jsonOk, readJson, requireId, requireSql, run } from "@/lib/agent/http";
import { parseItemPatch } from "@/lib/domain/validate";
import { validationError } from "@/lib/errors";
import { getItemDetail, updateItem } from "@/lib/services/items";

type Context = { params: Promise<{ id: string }> };

export async function GET(request: Request, context: Context) {
  return run(request, async () => {
    const id = await requireId(context.params);
    const detail = await getItemDetail(requireSql(), id);
    return jsonOk(detail);
  });
}

export async function PATCH(request: Request, context: Context) {
  return run(request, async () => {
    const id = await requireId(context.params);
    const parsed = parseItemPatch(await readJson(request));
    if (!parsed.ok) {
      throw validationError(parsed.details[0]?.message ?? "Invalid item.", parsed.details);
    }
    const item = await updateItem(requireSql(), id, parsed.value);
    return jsonOk({ item });
  });
}
