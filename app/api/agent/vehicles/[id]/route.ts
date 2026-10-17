import { jsonOk, readJson, requireId, requireSql, run } from "@/lib/agent/http";
import { parseVehiclePatch } from "@/lib/domain/entities";
import { notFound, validationError } from "@/lib/errors";
import { getVehicle } from "@/lib/repositories/subjects";
import { updateVehicle } from "@/lib/services/subjects";

type Context = { params: Promise<{ id: string }> };

export async function GET(request: Request, context: Context) {
  return run(request, async () => {
    const vehicle = await getVehicle(requireSql(), await requireId(context.params));
    if (!vehicle) throw notFound("Vehicle was not found.");
    return jsonOk({ vehicle });
  });
}

export async function PATCH(request: Request, context: Context) {
  return run(request, async () => {
    const parsed = parseVehiclePatch(await readJson(request));
    if (!parsed.ok) {
      throw validationError(parsed.details[0]?.message ?? "Invalid vehicle.", parsed.details);
    }
    const vehicle = await updateVehicle(requireSql(), await requireId(context.params), parsed.value);
    return jsonOk({ vehicle });
  });
}
