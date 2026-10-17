import { jsonOk, readJson, requireSql, run } from "@/lib/agent/http";
import { parseFamilyCreate } from "@/lib/domain/entities";
import { validationError } from "@/lib/errors";
import { createFamily, listFamily } from "@/lib/services/subjects";

export async function GET(request: Request) {
  return run(request, async () => {
    const includeArchived = new URL(request.url).searchParams.get("include_archived") === "1";
    const family = await listFamily(requireSql(), includeArchived);
    return jsonOk({ family });
  });
}

export async function POST(request: Request) {
  return run(request, async () => {
    const parsed = parseFamilyCreate(await readJson(request));
    if (!parsed.ok) {
      throw validationError(parsed.details[0]?.message ?? "Invalid family member.", parsed.details);
    }
    const member = await createFamily(requireSql(), parsed.value);
    return jsonOk({ family_member: member }, {}, 201);
  });
}
