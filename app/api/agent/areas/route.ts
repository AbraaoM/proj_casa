import { jsonOk, readJson, requireSql, run } from "@/lib/agent/http";
import { parseAreaCreate } from "@/lib/domain/areas";
import { validationError } from "@/lib/errors";
import { createArea, listAreas } from "@/lib/services/areas";

export async function GET(request: Request) {
  return run(request, async () => {
    const includeArchived = new URL(request.url).searchParams.get("include_archived") === "1";
    const areas = await listAreas(requireSql(), includeArchived);
    return jsonOk({ areas });
  });
}

/** Idempotent by slug: an existing slug comes back untouched with meta.idempotent_replay. */
export async function POST(request: Request) {
  return run(request, async () => {
    const parsed = parseAreaCreate(await readJson(request));
    if (!parsed.ok) throw validationError(parsed.details[0]?.message ?? "Invalid area.", parsed.details);
    const created = await createArea(requireSql(), parsed.value);
    return jsonOk(
      { area: created.area },
      { idempotent_replay: created.idempotentReplay },
      created.idempotentReplay ? 200 : 201,
    );
  });
}
