import type { AgentCaller } from "@/lib/agent/actor";
import { jsonError } from "@/lib/agent/http";
import { decideAgentAccess, hashAgentKey, type AgentKeyStatus } from "@/lib/agent/keys";
import { tryGetSql } from "@/lib/db/client";
import { isMissingSchema } from "@/lib/db/errors";
import { findAgentKeyCaller, findOwnerCaller } from "@/lib/repositories/agent-keys";

/** What the key lookup returns: the status plus, when the hash matches, who the key belongs to. */
export type AgentKeyLookupResult = AgentKeyStatus & { caller?: AgentCaller | null };
export type AgentKeyLookup = (keyHash: string | null) => Promise<AgentKeyLookupResult>;
/** Resolves the person behind the AGENT_API_KEY environment secret (the first master account). */
export type OwnerLookup = () => Promise<AgentCaller | null>;

export type AuthResult = { ok: true; caller: AgentCaller } | { ok: false; response: Response };

const ANONYMOUS_ENV: AgentCaller = { userId: null, username: null, keyId: null, agentName: null };

/**
 * Checks the bearer key and says who is calling: the person (users) and the agent (agent_keys).
 * The environment secret AGENT_API_KEY still works and acts as the first master account.
 */
export async function authorize(
  request: Request,
  lookup: AgentKeyLookup = defaultLookup,
  owner: OwnerLookup = defaultOwner,
): Promise<AuthResult> {
  return authorizeToken(readBearer(request), lookup, owner);
}

export async function authorizeToken(
  presented: string,
  lookup: AgentKeyLookup = defaultLookup,
  owner: OwnerLookup = defaultOwner,
): Promise<AuthResult> {
  const envKey = process.env.AGENT_API_KEY;
  const closed: AgentKeyStatus = { available: false, hasActiveKey: false, hashMatches: false };

  if (decideAgentAccess({ presented, envKey, database: closed }) === "allow") {
    let caller = ANONYMOUS_ENV;
    try {
      caller = (await owner()) ?? ANONYMOUS_ENV;
    } catch {
      // The environment secret works while the database is down; nobody is attributed then.
    }
    return { ok: true, caller };
  }

  let database: AgentKeyLookupResult;
  try {
    database = await lookup(presented ? hashAgentKey(presented) : null);
  } catch (error) {
    if (!isMissingSchema(error)) {
      console.error("agent key lookup failed");
      return deny(jsonError("database_unavailable", "Could not verify agent keys.", 503));
    }
    database = { available: true, hasActiveKey: false, hashMatches: false };
  }

  const decision = decideAgentAccess({ presented, envKey, database });
  if (decision === "allow") {
    return { ok: true, caller: database.caller ?? ANONYMOUS_ENV };
  }
  if (decision === "agent_not_configured") {
    return deny(jsonError("agent_not_configured", "No agent API key is configured.", 503));
  }
  return deny(jsonError("unauthorized", "Missing or invalid agent API key.", 401));
}

function deny(response: Response): AuthResult {
  return { ok: false, response };
}

export function readBearer(request: Request): string {
  const header = request.headers.get("authorization") ?? "";
  const match = /^Bearer\s+(\S+)\s*$/i.exec(header);
  return match?.[1] ?? "";
}

async function defaultLookup(keyHash: string | null): Promise<AgentKeyLookupResult> {
  const sql = tryGetSql();
  if (!sql) return { available: false, hasActiveKey: false, hashMatches: false };
  const status = await findAgentKeyCaller(sql, keyHash);
  return { available: true, ...status };
}

async function defaultOwner(): Promise<AgentCaller | null> {
  const sql = tryGetSql();
  if (!sql) return null;
  return findOwnerCaller(sql);
}
