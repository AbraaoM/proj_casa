import { handleWebhookRequest } from "@/lib/bot/webhook-route";

export const maxDuration = 60;

/** One webhook per family: each family brings its own Telegram bot. */
export async function POST(request: Request, context: { params: Promise<{ familyId: string }> }) {
  const { familyId } = await context.params;
  return handleWebhookRequest(request, familyId);
}
