"use client";

import { useEffect, useState, useCallback } from "react";

/** Per-agent status returned by GET /api/status. */
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

/** Response shape from GET /api/status. */
interface StatusResponse {
  agents: AgentStatus[];
}

const STATUS_COLORS: Record<string, string> = {
  idle: "bg-green-500",
  working: "bg-orange-500",
  building: "bg-red-500",
  polling: "bg-blue-500",
};

const STATUS_GLOW: Record<string, string> = {
  idle: "shadow-green-500/50",
  working: "shadow-orange-500/50",
  building: "shadow-red-500/50",
  polling: "shadow-blue-500/50",
};

function formatDuration(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  if (hours > 0) return `${hours}h ${minutes}m`;
  if (minutes > 0) return `${minutes}m ${seconds}s`;
  return `${seconds}s`;
}

function formatTimeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  if (diff < 0) return "just now";
  return `${formatDuration(diff)} ago`;
}

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString([], {
    hour: "numeric",
    minute: "2-digit",
  });
}

export default function Dashboard() {
  const [agents, setAgents] = useState<AgentStatus[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [tick, setTick] = useState(0);

  const fetchStatus = useCallback(async () => {
    try {
      const res = await fetch("/api/status");
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data: StatusResponse = await res.json();
      setAgents(data.agents);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to fetch status");
    }
  }, []);

  // Fetch on mount + every 15 seconds
  useEffect(() => {
    fetchStatus();
    const interval = setInterval(fetchStatus, 15_000);
    return () => clearInterval(interval);
  }, [fetchStatus]);

  // Tick every second to update relative times
  useEffect(() => {
    const interval = setInterval(() => setTick((t) => t + 1), 1000);
    return () => clearInterval(interval);
  }, []);

  void tick;

  if (error && agents.length === 0) {
    return (
      <main className="flex items-center justify-center min-h-screen p-4">
        <div className="bg-red-950/50 border border-red-800 rounded-lg p-6 max-w-md">
          <p className="text-red-400 text-sm">Failed to load status: {error}</p>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen p-4 sm:p-8 flex flex-col items-center">
      <div className="w-full max-w-3xl space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold tracking-tight text-gray-100">
            Ralph Status
          </h1>
          <span className="text-xs text-gray-600">
            {agents.length} agent{agents.length !== 1 ? "s" : ""}
          </span>
        </div>

        {agents.length === 0 && (
          <div className="bg-gray-900 border border-gray-800 rounded-xl p-8 text-center">
            <p className="text-gray-500 text-sm">
              No agents connected. Start a Ralph orchestrator to begin.
            </p>
          </div>
        )}

        {/* Agent Cards */}
        {agents.map((agent) => (
          <AgentCard key={agent.agentId} agent={agent} />
        ))}

        {/* Footer */}
        <p className="text-center text-[11px] text-gray-700 pt-4">
          Auto-refreshes every 15s
        </p>
      </div>
    </main>
  );
}

function AgentCard({ agent }: { agent: AgentStatus }) {
  const heartbeatAge = agent.lastHeartbeat
    ? Date.now() - new Date(agent.lastHeartbeat).getTime()
    : null;
  const heartbeatStale = heartbeatAge !== null && heartbeatAge > 5 * 60 * 1000;

  const workingFor = agent.currentTaskStartedAt
    ? Date.now() - new Date(agent.currentTaskStartedAt).getTime()
    : null;

  const shortId = agent.agentId.slice(0, 8);

  return (
    <div className="bg-gray-900 border border-gray-800 rounded-xl p-6 space-y-4">
      {/* Agent header: status dot + profile/ID + heartbeat */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div
            className={`w-3.5 h-3.5 rounded-full ${STATUS_COLORS[agent.status] ?? "bg-gray-600"} shadow-lg ${STATUS_GLOW[agent.status] ?? ""} ${agent.status === "working" || agent.status === "building" ? "animate-pulse" : ""}`}
          />
          <div>
            <p className="text-sm font-semibold capitalize text-gray-100">
              {agent.status}
            </p>
            <p className="text-[11px] text-gray-600 font-mono">{shortId}</p>
          </div>
        </div>
        <div className="flex items-center gap-2 text-[11px] text-gray-500">
          <span
            className={`inline-block w-1.5 h-1.5 rounded-full ${heartbeatStale ? "bg-yellow-500 animate-pulse" : "bg-gray-600"}`}
          />
          {agent.lastHeartbeat
            ? formatTimeAgo(agent.lastHeartbeat)
            : "no heartbeat"}
        </div>
      </div>

      {/* Active task */}
      {agent.currentTask && (
        <div className="pt-2 border-t border-gray-800 space-y-1.5">
          <Row label="Working on" value={agent.currentTask} highlight />
          {agent.profileId && (
            <Row label="Profile" value={agent.profileId} />
          )}
          {workingFor !== null && workingFor > 0 && (
            <Row label="Duration" value={formatDuration(workingFor)} />
          )}
        </div>
      )}

      {/* Stats row */}
      <div className="flex gap-4 pt-2 border-t border-gray-800">
        <MiniStat label="Queue" value={String(agent.queueSize)} />
        <MiniStat label="Processed" value={String(agent.totalProcessed)} />
        <MiniStat
          label="Last"
          value={
            agent.lastCompletedTask
              ? `${agent.lastCompletedTask}${agent.lastCompletedAt ? ` at ${formatTime(agent.lastCompletedAt)}` : ""}`
              : "—"
          }
        />
      </div>

      {/* Stale warning */}
      {heartbeatStale && (
        <div className="bg-yellow-950/40 border border-yellow-800/60 rounded-lg px-3 py-2 text-yellow-400 text-[11px]">
          Last heartbeat {formatTimeAgo(agent.lastHeartbeat)} — agent may be
          offline
        </div>
      )}
    </div>
  );
}

function Row({
  label,
  value,
  highlight,
}: {
  label: string;
  value: string;
  highlight?: boolean;
}) {
  return (
    <div className="flex items-baseline justify-between text-sm">
      <span className="text-gray-500">{label}</span>
      <span
        className={highlight ? "text-white font-semibold" : "text-gray-300"}
      >
        {value}
      </span>
    </div>
  );
}

function MiniStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex-1">
      <p className="text-[11px] text-gray-600">{label}</p>
      <p className="text-sm font-semibold text-gray-300">{value}</p>
    </div>
  );
}
