import { NextRequest, NextResponse } from "next/server";
import { Redis } from "@upstash/redis";

export const dynamic = "force-dynamic";

/** Payload sent by each Ralph orchestrator instance. */
interface HeartbeatPayload {
  /** Unique agent ID — UUID generated on orchestrator startup. */
  agentId: string;
  status: "idle" | "working" | "building" | "polling";
  queueSize: number;
  currentTask: string | null;
  currentTaskStartedAt: string | null;
  profileId: string | null;
  totalProcessed: number;
  lastCompletedTask: string | null;
  lastCompletedAt: string | null;
}

/**
 * POST /api/heartbeat
 *
 * Authenticated write endpoint. Each orchestrator sends periodic heartbeats
 * identified by a unique `agentId` (UUID generated at startup).
 *
 * Authentication: `Authorization: Bearer <DASHBOARD_SECRET>`
 *
 * The shared secret is set via the `DASHBOARD_SECRET` environment variable
 * on both the orchestrator and the Vercel deployment. Generate one with
 * `openssl rand -hex 32`. This is a simple bearer token scheme — the secret
 * is sent in the Authorization header and compared server-side.
 */
export async function POST(request: NextRequest) {
  const secret = process.env.DASHBOARD_SECRET;
  if (!secret) {
    return NextResponse.json(
      { error: "Server misconfigured: DASHBOARD_SECRET not set" },
      { status: 500 },
    );
  }

  const auth = request.headers.get("authorization");
  if (auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: HeartbeatPayload;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  if (!body.agentId || typeof body.agentId !== "string") {
    return NextResponse.json(
      { error: "Missing required field: agentId" },
      { status: 400 },
    );
  }

  const key = `ralph:agent:${body.agentId}`;
  const data = {
    ...body,
    lastHeartbeat: new Date().toISOString(),
  };

  const redis = Redis.fromEnv();

  // Store with 24h TTL — agents that stop heartbeating expire automatically
  await redis.set(key, data, { ex: 86400 });

  // Add agent to the set of known agents (for listing)
  await redis.sadd("ralph:agents", body.agentId);

  return NextResponse.json({ ok: true });
}
