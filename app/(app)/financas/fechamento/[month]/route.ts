import { currentUser } from "@/lib/auth/session";
import { tryGetSql } from "@/lib/db/client";
import { isMonth } from "@/lib/domain/finance/dates";
import { AppError } from "@/lib/errors";
import { requireMonthClose } from "@/lib/services/finance/close";
import { renderClosePdf } from "@/lib/ui/close-pdf";

type Context = { params: Promise<{ month: string }> };

/** The closed month as a PDF, for whoever is logged in. */
export async function GET(_request: Request, context: Context) {
  const user = await currentUser();
  if (!user) return new Response(null, { status: 401 });
  const { month } = await context.params;
  if (!isMonth(month)) return new Response("Mês não encontrado.", { status: 404 });
  const sql = tryGetSql();
  if (!sql) return new Response("Banco indisponível.", { status: 503 });
  try {
    const close = await requireMonthClose(sql, month);
    const pdf = renderClosePdf(close);
    return new Response(Buffer.from(pdf), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `inline; filename="casa-fechamento-${month}.pdf"`,
      },
    });
  } catch (error) {
    if (error instanceof AppError && error.code === "not_found") return new Response("Esse mês ainda não foi fechado.", { status: 404 });
    console.error(error);
    return new Response("Não foi possível abrir o fechamento.", { status: 500 });
  }
}
