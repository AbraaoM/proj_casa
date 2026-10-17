import { jsonOk, readJson, requireSql, run } from "@/lib/agent/http";
import { parseCreateItem, parseItemListQuery } from "@/lib/domain/validate";
import { validationError } from "@/lib/errors";
import { createItem, listItems } from "@/lib/services/items";

export async function GET(request: Request) {
  return run(request, async () => {
    const parsed = parseItemListQuery(new URL(request.url).searchParams);
    if (!parsed.ok) {
      throw validationError(parsed.details[0]?.message ?? "Invalid query.", parsed.details);
    }
    const items = await listItems(requireSql(), parsed.value);
    return jsonOk({ items });
  });
}

export async function POST(request: Request) {
  return run(request, async () => {
    const parsed = parseCreateItem(await readJson(request));
    if (!parsed.ok) {
      throw validationError(parsed.details[0]?.message ?? "Invalid item.", parsed.details);
    }
    const created = await createItem(requireSql(), parsed.value);
    return jsonOk({ item: created.item }, { idempotent_replay: created.idempotentReplay }, created.idempotentReplay ? 200 : 201);
  });
}
