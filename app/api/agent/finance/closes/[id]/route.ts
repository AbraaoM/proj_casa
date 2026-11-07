import { jsonOk, requireSql, run } from "@/lib/agent/http";
import { isMonth } from "@/lib/domain/finance/dates";
import { notFound } from "@/lib/errors";
import { requireMonthClose } from "@/lib/services/finance/close";

type Context = { params: Promise<{ id: string }> };

/** The frozen close. 404 until the month is closed. */
export async function GET(request: Request, context: Context) {
  return run(request, async () => {
    const { id } = await context.params;
    if (!isMonth(id)) throw notFound("Month close was not found.");
    const close = await requireMonthClose(requireSql(), id);
    return jsonOk({ ...close, pdf_path: `/api/agent/finance/closes/${close.month}/pdf` });
  });
}
