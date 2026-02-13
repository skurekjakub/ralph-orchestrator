/**
 * Standalone script to preview the Ink dashboard with mock data.
 * Run with: npx tsx scripts/preview-dashboard.tsx
 */
import React, { useState, useEffect } from "react";
import { render, Box, Text } from "ink";

// Import dashboard components
import { StatusPanel } from "../src/dashboard/StatusPanel.js";
import { QueuePanel } from "../src/dashboard/QueuePanel.js";
import { HistoryPanel } from "../src/dashboard/HistoryPanel.js";
import { LogPanel } from "../src/dashboard/LogPanel.js";
import type { OrchestratorState, CompletedTask, LogEntry } from "../src/orchestrator.js";

// ── Mock data ────────────────────────────────────────────

const mockLogs: LogEntry[] = [
  { timestamp: Date.now() - 120000, level: "info", message: "Orchestrator started" },
  { timestamp: Date.now() - 110000, level: "info", message: "Polling JIRA for issues..." },
  { timestamp: Date.now() - 100000, level: "info", message: "Found 2 issues: DF-2759, DF-2757" },
  { timestamp: Date.now() - 95000, level: "info", message: "Enqueued DF-2759: SaaS environment deployment docs" },
  { timestamp: Date.now() - 94000, level: "info", message: "Enqueued DF-2757: Custom module integration guide" },
  { timestamp: Date.now() - 90000, level: "info", message: "Picked up DF-2759: SaaS environment deployment docs" },
  { timestamp: Date.now() - 85000, level: "info", message: "Transitioning DF-2759 to In Progress (id=141)..." },
  { timestamp: Date.now() - 84000, level: "info", message: "DF-2759 transitioned to In Progress" },
  { timestamp: Date.now() - 83000, level: "info", message: "Posting start comment on DF-2759..." },
  { timestamp: Date.now() - 80000, level: "info", message: "Starting devcontainer..." },
  { timestamp: Date.now() - 30000, level: "info", message: "Devcontainer started successfully" },
  { timestamp: Date.now() - 29000, level: "info", message: "Verifying container health..." },
  { timestamp: Date.now() - 28000, level: "info", message: "Cleaning previous audit logs..." },
  { timestamp: Date.now() - 27000, level: "info", message: "Executing Ralph agent for DF-2759 (timeout: 1800s)..." },
  { timestamp: Date.now() - 5000, level: "warn", message: "Build validation failed, tech-writer retrying..." },
];

function DashboardPreview(): React.ReactElement {
  const [phase, setPhase] = useState<"working" | "idle">("working");
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    const timer = setInterval(() => {
      setElapsed((e) => e + 1);
    }, 1000);

    // Switch to idle after 8 seconds
    const switchTimer = setTimeout(() => {
      setPhase("idle");
    }, 8000);

    return () => {
      clearInterval(timer);
      clearTimeout(switchTimer);
    };
  }, []);

  const completedTasks: CompletedTask[] =
    phase === "idle"
      ? [
          {
            key: "DF-2759",
            summary: "SaaS environment deployment docs",
            status: "completed",
            durationMs: 452000,
            prUrl: "https://dev.azure.com/org/project/_git/repo/pullrequest/42",
          },
        ]
      : [];

  const state: OrchestratorState = {
    status: phase,
    currentIssue:
      phase === "working"
        ? { key: "DF-2759", summary: "SaaS environment deployment docs" }
        : null,
    queueSize: phase === "working" ? 1 : 0,
    queueItems:
      phase === "working"
        ? [{ key: "DF-2757", summary: "Custom module integration guide" }]
        : [],
    completedToday: completedTasks,
    startedAt: phase === "working" ? Date.now() - elapsed * 1000 : null,
    logs: phase === "working"
      ? mockLogs
      : [
          ...mockLogs,
          { timestamp: Date.now(), level: "info" as const, message: "✓ DF-2759 completed: completed (452s)" },
          { timestamp: Date.now(), level: "info" as const, message: "PR created: https://dev.azure.com/org/project/_git/repo/pullrequest/42" },
          { timestamp: Date.now(), level: "info" as const, message: "DF-2759 moved to Ready for Review" },
        ],
  };

  return (
    <Box
      flexDirection="column"
      borderStyle="round"
      borderColor="blue"
      paddingX={2}
      paddingY={1}
    >
      <Text bold color="blue">
        🤖 Ralph Orchestrator
      </Text>

      <StatusPanel state={state} />

      <Box marginTop={1}>
        <Text dimColor>{'─'.repeat(50)}</Text>
      </Box>

      <QueuePanel state={state} />
      <HistoryPanel completed={state.completedToday} />

      <Box marginTop={1}>
        <Text dimColor>{'─'.repeat(50)}</Text>
      </Box>

      <LogPanel logs={state.logs} />

      <Box marginTop={1}>
        <Text dimColor>
          Output: ./output/logs/ │ Press Ctrl+C to stop
        </Text>
      </Box>
    </Box>
  );
}

const { unmount } = render(<DashboardPreview />);

// Auto-exit after 10 seconds
setTimeout(() => {
  unmount();
  process.exit(0);
}, 10000);
