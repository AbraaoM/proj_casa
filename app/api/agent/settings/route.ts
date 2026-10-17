import { jsonOk, readJson, requireSql, run } from "@/lib/agent/http";
import { parseSettingsPatch } from "@/lib/domain/entities";
import { validationError } from "@/lib/errors";
import { patchSettings, readSettings } from "@/lib/services/settings";

export async function GET(request: Request) {
  return run(request, async () => jsonOk({ settings: await readSettings(requireSql()) }));
}

export async function PATCH(request: Request) {
  return run(request, async () => {
    const parsed = parseSettingsPatch(await readJson(request));
    if (!parsed.ok) {
      throw validationError(parsed.details[0]?.message ?? "Invalid settings.", parsed.details);
    }
    const settings = await patchSettings(requireSql(), parsed.value);
    return jsonOk({ settings });
  });
}
