import type { Sql } from "@/lib/db/client";
import { reaisToCents, screenPayKey } from "@/lib/domain/finance/screen-pay";
import { parsePay } from "@/lib/domain/finance/validate";
import { getBill, payBill, type PayResult } from "@/lib/services/finance/bills";

export type ScreenPay =
  | { ok: true; replay: boolean; result: PayResult }
  | { ok: false; message: string };

/**
 * "Paguei" from the screen: today, the bill's own account, the typed amount (or the
 * expected one). Same parse and same service as the agent route; no rule lives here.
 */
export async function payFromScreen(
  sql: Sql,
  input: { billId: string; dueDate: string; amount: string | null },
  today: string,
): Promise<ScreenPay> {
  const bill = await getBill(sql, input.billId);
  if (bill.status !== "active") return { ok: false, message: "Esta conta não está ativa." };
  const amount = reaisToCents(input.amount);
  if (amount === undefined) return { ok: false, message: "Valor inválido. Use, por exemplo, 198,73." };
  const parsed = parsePay({
    amount_cents: amount ?? undefined,
    external_key: screenPayKey(bill.id, input.dueDate),
  });
  if (!parsed.ok) return { ok: false, message: "Não consegui registrar o pagamento." };
  const result = await payBill(sql, bill.id, parsed.value, today);
  return { ok: true, replay: result.idempotentReplay, result };
}
