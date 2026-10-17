import { jsonOk, readJson, requireAreaRef, requireSql, run } from "@/lib/agent/http";
import { parseAreaPatch } from "@/lib/domain/areas";
import { validationError } from "@/lib/errors";
import { getArea, updateArea } from "@/lib/services/areas";

type Context = { params: Promise<{ id: string }> };

/** :id accepts the area's uuid or its slug. */
export async function GET(request: Request, context: Context) {
  return run(request, async () => {
    const area = await getArea(requireSql(), await requireAreaRef(context.params));
    return jsonOk({ area });
  });
}

export async function PATCH(request: Request, context: Context) {
  return run(request, async () => {
    const ref = await requireAreaRef(context.params);
    const parsed = parseAreaPatch(await readJson(request));
    if (!parsed.ok) throw validationError(parsed.details[0]?.message ?? "Invalid area.", parsed.details);
    const area = await updateArea(requireSql(), ref, parsed.value);
    return jsonOk({ area });
  });
}
