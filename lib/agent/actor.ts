import { AsyncLocalStorage } from "node:async_hooks";
import { withTenant, type TenantScope } from "@/lib/tenant/scope";

/** Who is calling: the person the key belongs to and the key itself (the agent). */
export type AgentCaller = {
  userId: string | null;
  username: string | null;
  /** agent_keys.id; null for the AGENT_API_KEY environment secret. */
  keyId: string | null;
  /** The name the person gave their agent (agent_keys.label). */
  agentName: string | null;
  /** The family the key belongs to. Every query of the call is limited to it. */
  tenant?: TenantScope | null;
};

/** panel = a one-tap button in the app (attributed, never logged as agent activity). */
export type AgentChannel = "rest" | "mcp" | "telegram" | "panel";

type ActorScope = { caller: AgentCaller; channel: AgentChannel };

const storage = new AsyncLocalStorage<ActorScope>();

/** Runs fn with the caller in scope; repository inserts read it to fill created_by_user_id and agent_key_id. */
export function withCaller<T>(caller: AgentCaller, channel: AgentChannel, fn: () => Promise<T>): Promise<T> {
  const run = () => storage.run({ caller, channel }, fn);
  return caller.tenant ? withTenant(caller.tenant, run) : run();
}

export function currentCaller(): AgentCaller | null {
  return storage.getStore()?.caller ?? null;
}

export function currentChannel(): AgentChannel | null {
  return storage.getStore()?.channel ?? null;
}

/** The two attribution values for an INSERT, null outside an agent call (panel taps). */
export function attribution(): { userId: string | null; keyId: string | null } {
  const caller = currentCaller();
  return { userId: caller?.userId ?? null, keyId: caller?.keyId ?? null };
}
