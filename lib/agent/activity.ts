import type { AgentCaller, AgentChannel } from "@/lib/agent/actor";
import { tryGetSql } from "@/lib/db/client";
import { isMissingSchema } from "@/lib/db/errors";

/**
 * One row per agent write: who (person and agent key), where (rest, mcp, telegram), what and the status.
 * Best effort: a failure here never changes the answer the agent gets.
 */
export async function recordActivity(caller: AgentCaller, channel: AgentChannel, action: string, status: number): Promise<void> {
  const sql = tryGetSql();
  if (!sql) return;
  try {
    await sql.query(
      `INSERT INTO agent_activity (user_id, agent_key_id, channel, action, status)
       VALUES ($1::uuid, $2::uuid, $3, $4, $5)`,
      [caller.userId, caller.keyId, channel, action.slice(0, 200), status],
    );
  } catch (error) {
    if (!isMissingSchema(error)) console.error("agent activity log failed");
  }
}
