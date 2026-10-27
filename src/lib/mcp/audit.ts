import "server-only";
import { desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { agentActions, user } from "@/db/schema";

export type AgentOutcome = "ok" | "error" | "denied";

// Long values (post bodies, replies) are logged by length plus a preview,
// so the log shows what an agent did without storing whole documents.
function summarize(args: Record<string, unknown>) {
  return Object.fromEntries(
    Object.entries(args).map(([key, value]) => {
      if (typeof value === "string" && value.length > 200)
        return [key, `${value.slice(0, 160)}… (${value.length} characters)`];
      return [key, value];
    }),
  );
}

export async function logAgentAction(entry: {
  userId: string;
  credential: string | null;
  client: string | null;
  ip: string | null;
  tool: string;
  args: Record<string, unknown>;
  outcome: AgentOutcome;
  message?: string | null;
  target?: string | null;
}) {
  try {
    await db.insert(agentActions).values({
      userId: entry.userId,
      credential: entry.credential,
      client: entry.client?.slice(0, 200) ?? null,
      ipAddress: entry.ip,
      tool: entry.tool,
      args: summarize(entry.args),
      outcome: entry.outcome,
      message: entry.message?.slice(0, 1000) ?? null,
      target: entry.target ?? null,
    });
  } catch (error) {
    // Logging must never break the agent's call
    console.error("[mcp] failed to record agent action", error);
  }
}

export async function recentAgentActions(limit = 100) {
  return db
    .select({
      id: agentActions.id,
      createdAt: agentActions.createdAt,
      tool: agentActions.tool,
      args: agentActions.args,
      outcome: agentActions.outcome,
      message: agentActions.message,
      target: agentActions.target,
      credential: agentActions.credential,
      client: agentActions.client,
      userName: user.name,
    })
    .from(agentActions)
    .leftJoin(user, eq(user.id, agentActions.userId))
    .orderBy(desc(agentActions.createdAt), desc(agentActions.id))
    .limit(limit);
}
