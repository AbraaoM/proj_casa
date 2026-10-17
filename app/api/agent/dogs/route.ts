import { jsonOk, readJson, requireSql, run } from "@/lib/agent/http";
import { parseDogCreate } from "@/lib/domain/entities";
import { validationError } from "@/lib/errors";
import { createDog, listDogs } from "@/lib/services/subjects";

export async function GET(request: Request) {
  return run(request, async () => {
    const includeArchived = new URL(request.url).searchParams.get("include_archived") === "1";
    const dogs = await listDogs(requireSql(), includeArchived);
    return jsonOk({ dogs });
  });
}

export async function POST(request: Request) {
  return run(request, async () => {
    const parsed = parseDogCreate(await readJson(request));
    if (!parsed.ok) {
      throw validationError(parsed.details[0]?.message ?? "Invalid dog.", parsed.details);
    }
    const dog = await createDog(requireSql(), parsed.value);
    return jsonOk({ dog }, {}, 201);
  });
}
