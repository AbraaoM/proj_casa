import { requireSql, run } from "@/lib/agent/http";
import { isMonth } from "@/lib/domain/finance/dates";
import { notFound } from "@/lib/errors";
import { requireMonthClose } from "@/lib/services/finance/close";
import { renderClosePdf } from "@/lib/ui/close-pdf";

type Context = { params: Promise<{ id: string }> };

/** The same close, as a PDF. The agent fetches this path with its bearer key. */
export async function GET(request: Request, context: Context) {
  return run(request, async () => {
    const { id } = await context.params;
    if (!isMonth(id)) throw notFound("Month close was not found.");
    const close = await requireMonthClose(requireSql(), id);
    const pdf = renderClosePdf(close);
    return new Response(Buffer.from(pdf), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `inline; filename="casa-fechamento-${id}.pdf"`,
      },
    });
  });
}
