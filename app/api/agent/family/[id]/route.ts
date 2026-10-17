import { jsonOk, readJson, requireId, requireSql, run } from "@/lib/agent/http";
import { parseFamilyPatch } from "@/lib/domain/entities";
import { notFound, validationError } from "@/lib/errors";
import { getFamilyMember } from "@/lib/repositories/subjects";
import { updateFamily } from "@/lib/services/subjects";

type Context = { params: Promise<{ id: string }> };

export async function GET(request: Request, context: Context) {
  return run(request, async () => {
    const member = await getFamilyMember(requireSql(), await requireId(context.params));
    if (!member) throw notFound("Family member was not found.");
    return jsonOk({ family_member: member });
  });
}

export async function PATCH(request: Request, context: Context) {
  return run(request, async () => {
    const parsed = parseFamilyPatch(await readJson(request));
    if (!parsed.ok) {
      throw validationError(parsed.details[0]?.message ?? "Invalid family member.", parsed.details);
    }
    const member = await updateFamily(requireSql(), await requireId(context.params), parsed.value);
    return jsonOk({ family_member: member });
  });
}
