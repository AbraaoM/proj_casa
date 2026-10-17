import { createHash, timingSafeEqual } from "node:crypto";
import { jsonError } from "@/lib/agent/http";

export function authorize(request: Request): Response | null {
  const expected = process.env.AGENT_API_KEY?.trim();
  if (!expected) {
    return jsonError("agent_not_configured", "AGENT_API_KEY is not set on the server.", 503);
  }

  const header = request.headers.get("authorization") ?? "";
  const match = /^Bearer\s+(\S+)\s*$/i.exec(header);
  const given = match?.[1] ?? "";
  if (!safeEqual(given, expected)) {
    return jsonError("unauthorized", "Missing or invalid agent API key.", 401);
  }
  return null;
}

function safeEqual(left: string, right: string): boolean {
  const leftHash = createHash("sha256").update(left).digest();
  const rightHash = createHash("sha256").update(right).digest();
  return timingSafeEqual(leftHash, rightHash);
}
