import type { CompletedTask, LogEntry, OrchestratorState, TaskLogGroup } from "../types";
import type { IssueGroup } from "../components/log-browser/utils";

export function makeLogEntry(overrides: Partial<LogEntry> = {}): LogEntry {
  return {
    timestamp: new Date("2026-03-07T09:20:00.000Z").getTime(),
    level: "info",
    message: "hello world",
    ...overrides,
  };
}

export function makeCompletedTask(overrides: Partial<CompletedTask> = {}): CompletedTask {
  return {
    key: "DOC-3141",
    summary: "Review tag validation",
    profileId: "ralph-vscode",
    status: "completed",
    durationMs: 125000,
    completedAt: new Date("2026-03-07T09:20:00.000Z").getTime(),
    ...overrides,
  };
}

export function makeOrchestratorState(overrides: Partial<OrchestratorState> = {}): OrchestratorState {
  return {
    status: "working",
    currentIssue: { key: "DOC-3141", summary: "Review tag validation" },
    currentProfile: "ralph-vscode",
    startedAt: new Date("2026-03-07T09:18:00.000Z").getTime(),
    completedToday: [makeCompletedTask()],
    queueSize: 2,
    queueItems: [{ key: "DOC-3175", summary: "Autocomplete status colors" }],
    logs: [makeLogEntry()],
    orchestratorLogs: [makeLogEntry({ source: "orchestrator" })],
    containerLogs: [makeLogEntry({ source: "container", message: "container output" })],
    profileIds: ["ralph-vscode"],
    ...overrides,
  };
}

export function makeTaskLogGroup(overrides: Partial<TaskLogGroup> = {}): TaskLogGroup {
  return {
    id: "DOC-3141-1772871646745",
    taskId: "DOC-3141",
    timestamp: new Date("2026-03-07T09:20:00.000Z").getTime(),
    files: {
      log: "DOC-3141/run.log",
      summary: "DOC-3141/summary.json",
      preTool: "DOC-3141/pre-tool.log",
      toolOutput: "DOC-3141/tool-output.log",
      cliDebug: "DOC-3141/cli-debug.log",
    },
    summary: {
      taskId: "DOC-3141",
      status: "completed",
      durationMs: 125000,
      prUrl: "https://example.test/pr/1",
    },
    ...overrides,
  };
}

export function makeIssueGroup(overrides: Partial<IssueGroup> = {}): IssueGroup {
  const execution = makeTaskLogGroup();
  return {
    taskId: "DOC-3141",
    executions: [execution],
    latestStatus: execution.summary?.status,
    latestTimestamp: execution.timestamp,
    ...overrides,
  };
}