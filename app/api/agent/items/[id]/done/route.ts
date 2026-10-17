import { jsonOk, readJson, requireId, requireSql, run } from "@/lib/agent/http";
import { todayInTimeZone } from "@/lib/domain/dates";
import { parseDoneBody } from "@/lib/domain/validate";
import { validationError } from "@/lib/errors";
import { findEventByExternalKey, getItem, writeDone } from "@/lib/repositories/items";
import { markItemDone } from "@/lib/services/mark-done";
import { readSettings } from "@/lib/services/settings";

type Context = { params: Promise<{ id: string }> };

export async function POST(request: Request, context: Context) {
  return run(request, async () => {
    const id = await requireId(context.params);
    const parsed = parseDoneBody(await readJson(request));
    if (!parsed.ok) {
      throw validationError(parsed.details[0]?.message ?? "Invalid done payload.", parsed.details);
    }
    const sql = requireSql();
    const settings = await readSettings(sql);
    const result = await markItemDone(
      {
        getItem: (itemId) => getItem(sql, itemId),
        findEventByExternalKey: (key) => findEventByExternalKey(sql, key),
        writeDone: (write) => writeDone(sql, write),
      },
      id,
      parsed.value,
      todayInTimeZone(settings.timezone),
    );
    return jsonOk(
      { item: result.item, event: result.event },
      { idempotent_replay: result.idempotentReplay },
      result.idempotentReplay ? 200 : 201,
    );
  });
}
