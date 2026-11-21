import { handleWebhookRequest } from "@/lib/bot/webhook-route";

export const maxDuration = 60;

/** The webhook registered before families existed: it answers for the original family. New registrations use /api/telegram/webhook/<family>. */
export async function POST(request: Request) {
  return handleWebhookRequest(request, "original");
}
