import { tryGetSql } from "@/lib/db/client";
import { isMissingSchema } from "@/lib/db/errors";
import { listAgentKeys, type StoredAgentKey } from "@/lib/repositories/agent-keys";

export type AgentKeyList = {
  status: "ready" | "unconfigured" | "schema_missing" | "error";
  keys: StoredAgentKey[];
};

export async function loadAgentKeys(): Promise<AgentKeyList> {
  const sql = tryGetSql();
  if (!sql) return { status: "unconfigured", keys: [] };

  try {
    return { status: "ready", keys: await listAgentKeys(sql) };
  } catch (error) {
    if (isMissingSchema(error)) return { status: "schema_missing", keys: [] };
    console.error("list agent keys failed");
    return { status: "error", keys: [] };
  }
}
