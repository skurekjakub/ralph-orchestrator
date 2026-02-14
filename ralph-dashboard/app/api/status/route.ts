import { NextResponse } from "next/server";
import { Redis } from "@upstash/redis";

export const dynamic = "force-dynamic";

/** Per-agent status stored in KV (set by the heartbeat endpoint). */
interface AgentStatus {
  agentId: string;
  status: "idle" | "working" | "building" | "polling";
  queueSize: number;
  currentTask: string | null;
  currentTaskStartedAt: string | null;
  profileId: string | null;
  totalProcessed: number;
  lastCompletedTask: string | null;
  lastCompletedAt: string | null;
  lastHeartbeat: string;
}

/**
 * GET /api/status
 *
 * Returns all live Ralph agents. Each agent's KV key has a 24h TTL set by
 * the heartbeat endpoint; expired agents are automatically pruned here
 * (their IDs are removed from the `ralph:agents` set).
 */
export async function GET() {
  const redis = Redis.fromEnv();
  const agentIds = await redis.smembers("ralph:agents");

  if (!agentIds || agentIds.length === 0) {
    return NextResponse.json({ agents: [] });
  }

  // Fetch all agents in parallel
  const keys = agentIds.map((id) => `ralph:agent:${id}`);
  const results = await Promise.all(
    keys.map((key) => redis.get<AgentStatus>(key)),
  );

  const agents: AgentStatus[] = [];
  const expiredIds: string[] = [];

  for (let i = 0; i < agentIds.length; i++) {
    const data = results[i];
    if (data) {
      agents.push(data);
    } else {
      // Key expired (24h TTL) — remove from the set
      expiredIds.push(agentIds[i] as string);
    }
  }

  // Clean up expired agent IDs from the set
  if (expiredIds.length > 0) {
    await redis.srem("ralph:agents", ...expiredIds);
  }

  return NextResponse.json({ agents });
}
