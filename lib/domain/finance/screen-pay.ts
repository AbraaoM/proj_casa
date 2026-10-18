/**
 * The "Paguei" button. The payment itself goes through the same parsePay + payBill
 * as POST /api/agent/finance/bills/:id/pay.
 */

/** One key per bill and due date, so a second tap (or a stale tab) replays instead of paying twice. */
export function screenPayKey(billId: string, dueDate: string): string {
  return `ui:pay:${billId}:${dueDate}`;
}
