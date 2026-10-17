import { createHash, randomBytes } from "node:crypto";

export { SESSION_COOKIE, SESSION_DAYS } from "@/lib/auth/constants";

export function newSessionToken(): string {
  return randomBytes(32).toString("base64url");
}

export function hashSessionToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}
