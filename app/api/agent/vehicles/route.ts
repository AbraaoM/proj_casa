import { jsonOk, readJson, requireSql, run } from "@/lib/agent/http";
import { parseVehicleCreate } from "@/lib/domain/entities";
import { validationError } from "@/lib/errors";
import { createVehicle, listVehicles } from "@/lib/services/subjects";

export async function GET(request: Request) {
  return run(request, async () => {
    const includeArchived = new URL(request.url).searchParams.get("include_archived") === "1";
    const vehicles = await listVehicles(requireSql(), includeArchived);
    return jsonOk({ vehicles });
  });
}

export async function POST(request: Request) {
  return run(request, async () => {
    const parsed = parseVehicleCreate(await readJson(request));
    if (!parsed.ok) {
      throw validationError(parsed.details[0]?.message ?? "Invalid vehicle.", parsed.details);
    }
    const vehicle = await createVehicle(requireSql(), parsed.value);
    return jsonOk({ vehicle }, {}, 201);
  });
}
