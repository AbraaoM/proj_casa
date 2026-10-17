import { jsonError } from "@/lib/agent/http";
import { decideAgentAccess, hashAgentKey, type AgentKeyStatus } from "@/lib/agent/keys";
import { tryGetSql } from "@/lib/db/client";
import { isMissingSchema } from "@/lib/db/errors";
import { findAgentKeyStatus } from "@/lib/repositories/agent-keys";

export type AgentKeyLookup = (keyHash: string | null) => Promise<AgentKeyStatus>;

export async function authorize(request: Request, lookup: AgentKeyLookup = defaultLookup): Promise<Response | null> {
  const presented = readBearer(request);
  const envKey = process.env.AGENT_API_KEY;
  const closed: AgentKeyStatus = { available: false, hasActiveKey: false, hashMatches: false };

  if (decideAgentAccess({ presented, envKey, database: closed }) === "allow") return null;

  let database: AgentKeyStatus;
  try {
    database = await lookup(presented ? hashAgentKey(presented) : null);
  } catch (error) {
    if (!isMissingSchema(error)) {
      console.error("agent key lookup failed");
      return jsonError("database_unavailable", "Could not verify agent keys.", 503);
    }
    database = { available: true, hasActiveKey: false, hashMatches: false };
  }

  const decision = decideAgentAccess({ presented, envKey, database });
  if (decision === "allow") return null;
  if (decision === "agent_not_configured") {
    return jsonError("agent_not_configured", "No agent API key is configured.", 503);
  }
  return jsonError("unauthorized", "Missing or invalid agent API key.", 401);
}

function readBearer(request: Request): string {
  const header = request.headers.get("authorization") ?? "";
  const match = /^Bearer\s+(\S+)\s*$/i.exec(header);
  return match?.[1] ?? "";
}

async function defaultLookup(keyHash: string | null): Promise<AgentKeyStatus> {
  const sql = tryGetSql();
  if (!sql) return { available: false, hasActiveKey: false, hashMatches: false };
  const status = await findAgentKeyStatus(sql, keyHash);
  return { available: true, ...status };
}
