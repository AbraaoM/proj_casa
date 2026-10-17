/**
 * The "Paguei" button on the finance screen. Pure helpers: the payment itself goes
 * through the same parsePay + payBill as POST /api/agent/finance/bills/:id/pay.
 */

/** One key per bill and due date, so a second tap (or a stale tab) replays instead of paying twice. */
export function screenPayKey(billId: string, dueDate: string): string {
  return `ui:pay:${billId}:${dueDate}`;
}

/**
 * "198,73", "R$ 1.198,73", "198.73" or "198" in reais → cents. Empty → null (use the
 * bill's expected amount). Anything else → undefined (invalid).
 */
export function reaisToCents(raw: string | null | undefined): number | null | undefined {
  const text = (raw ?? "").replace(/R\$|\s/g, "");
  if (text === "") return null;
  let normalized = text;
  if (text.includes(",")) normalized = text.replace(/\./g, "").replace(",", ".");
  else if (/^\d{1,3}(\.\d{3})+$/.test(text)) normalized = text.replace(/\./g, "");
  if (!/^\d+(\.\d{1,2})?$/.test(normalized)) return undefined;
  const cents = Math.round(Number(normalized) * 100);
  return cents > 0 ? cents : undefined;
}

/** The value shown in the field: 19873 → "198,73". */
export function centsToReaisInput(cents: number): string {
  return (cents / 100).toFixed(2).replace(".", ",");
}
