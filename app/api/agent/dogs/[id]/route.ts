import { jsonOk, readJson, requireId, requireSql, run } from "@/lib/agent/http";
import { parseDogPatch } from "@/lib/domain/entities";
import { notFound, validationError } from "@/lib/errors";
import { getDog } from "@/lib/repositories/subjects";
import { updateDog } from "@/lib/services/subjects";

type Context = { params: Promise<{ id: string }> };

export async function GET(request: Request, context: Context) {
  return run(request, async () => {
    const dog = await getDog(requireSql(), await requireId(context.params));
    if (!dog) throw notFound("Dog was not found.");
    return jsonOk({ dog });
  });
}

export async function PATCH(request: Request, context: Context) {
  return run(request, async () => {
    const parsed = parseDogPatch(await readJson(request));
    if (!parsed.ok) {
      throw validationError(parsed.details[0]?.message ?? "Invalid dog.", parsed.details);
    }
    const dog = await updateDog(requireSql(), await requireId(context.params), parsed.value);
    return jsonOk({ dog });
  });
}
