import { createHash, randomBytes, timingSafeEqual } from "node:crypto";

export type AgentKeyMaterial = {
  token: string;
  prefix: string;
  hash: string;
};

export type AgentLabelResult = { ok: true; value: string } | { ok: false; message: string };

export type AgentKeyStatus = {
  available: boolean;
  hasActiveKey: boolean;
  hashMatches: boolean;
};

export type AgentAccess = "allow" | "unauthorized" | "agent_not_configured";

export type KeyActionState = {
  ok: boolean;
  message: string;
  token?: string;
  endpoint?: string;
  mcpEndpoint?: string;
};

export const idleKeyAction: KeyActionState = { ok: false, message: "" };

const PREFIX_LENGTH = 12;

export function newAgentKey(): AgentKeyMaterial {
  const token = `casa_${randomBytes(32).toString("base64url")}`;
  return { token, prefix: token.slice(0, PREFIX_LENGTH), hash: hashAgentKey(token) };
}

export function hashAgentKey(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export function parseAgentLabel(value: unknown): AgentLabelResult {
  if (typeof value !== "string") {
    return { ok: false, message: "O nome precisa ter entre 1 e 64 caracteres." };
  }
  const label = value.trim().replace(/\s+/g, " ");
  if (label.length < 1 || label.length > 64) {
    return { ok: false, message: "O nome precisa ter entre 1 e 64 caracteres." };
  }
  return { ok: true, value: label };
}

export function decideAgentAccess(input: {
  presented: string;
  envKey: string | null | undefined;
  database: AgentKeyStatus;
}): AgentAccess {
  const env = input.envKey?.trim() ?? "";
  const presented = input.presented;
  if (env.length > 0 && presented.length > 0 && safeEqual(presented, env)) return "allow";

  const database = input.database;
  if (database.available && database.hashMatches && presented.length > 0) return "allow";
  if (env.length === 0 && !(database.available && database.hasActiveKey)) return "agent_not_configured";
  return "unauthorized";
}

function safeEqual(left: string, right: string): boolean {
  const leftHash = createHash("sha256").update(left).digest();
  const rightHash = createHash("sha256").update(right).digest();
  return timingSafeEqual(leftHash, rightHash);
}
