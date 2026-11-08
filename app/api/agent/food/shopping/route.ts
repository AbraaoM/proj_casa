import { invalid, jsonOk, readJson, requireSql, run } from "@/lib/agent/http";
import { parseShoppingCreate } from "@/lib/domain/food";
import { addShopping, listShopping, presentShopping } from "@/lib/services/food";

export async function GET(request: Request) {
  return run(request, async () => {
    const includeBought = new URL(request.url).searchParams.get("include_bought") === "1";
    const lines = await listShopping(requireSql(), includeBought);
    return jsonOk({ lines: lines.map(presentShopping) });
  });
}

export async function POST(request: Request) {
  return run(request, async () => {
    const parsed = parseShoppingCreate(await readJson(request));
    if (!parsed.ok) throw invalid(parsed.details, "Invalid shopping line.");
    const result = await addShopping(requireSql(), parsed.value);
    return jsonOk({ line: presentShopping(result.line) }, { idempotent_replay: result.idempotent_replay }, result.idempotent_replay ? 200 : 201);
  });
}
