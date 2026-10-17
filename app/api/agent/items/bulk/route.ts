import { errorBody, jsonOk, readJson, requireSql, run } from "@/lib/agent/http";
import { parseBulkBody, parseCreateItem } from "@/lib/domain/validate";
import { validationError } from "@/lib/errors";
import { createItem } from "@/lib/services/items";

export async function POST(request: Request) {
  return run(request, async () => {
    const parsed = parseBulkBody(await readJson(request));
    if (!parsed.ok) {
      throw validationError(parsed.details[0]?.message ?? "Invalid bulk request.", parsed.details);
    }

    const sql = requireSql();
    const results = [];
    for (let index = 0; index < parsed.value.length; index += 1) {
      const item = parseCreateItem(parsed.value[index]);
      if (!item.ok) {
        results.push({
          index,
          ok: false,
          error: {
            code: "validation_error",
            message: item.details[0]?.message ?? "Invalid item.",
            details: item.details,
          },
        });
        continue;
      }
      try {
        const created = await createItem(sql, item.value);
        results.push({
          index,
          ok: true,
          data: { item: created.item },
          meta: { idempotent_replay: created.idempotentReplay },
        });
      } catch (error) {
        const body = errorBody(error);
        if (body.code === "internal_error") console.error(error);
        results.push({ index, ok: false, error: body });
      }
    }

    const succeeded = results.filter((result) => result.ok).length;
    return jsonOk({ results }, { succeeded, failed: results.length - succeeded });
  });
}
