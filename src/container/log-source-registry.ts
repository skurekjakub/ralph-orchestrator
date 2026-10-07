import type { ICliRuntime } from "../cli/cli-runtime";
import type { IAgentProfile } from "../config/types";
import { CaptureMode, type IContainerLogCollector } from "./log-collector";

/** Optional callbacks wired into streamed log sources. */
export interface LogSourceCallbacks {
  /** Invoked for each line of real-time tool output. */
  onToolOutput?: (line: string) => void;
  /** Invoked for each line of real-time pre-tool invocation output. */
  onPreToolUse?: (line: string) => void;
  /** Invoked for each line of real-time CLI debug log output. */
  onCliDebug?: (line: string) => void;
}

/** Path to the pre-tool invocation log inside the container. */
export const PRE_TOOL_PATH = "/workspace/.ralph/logs/pre-tool.log";

/** Path to the untruncated tool output log inside the container. */
export const TOOL_OUTPUT_PATH = "/workspace/.ralph/logs/tool-output.log";

/**
 * Registers all standard log sources on a task's collector and starts streaming.
 *
 * Registers the sources every task has (audit log, tool logs, proxy, MCP sidecar, task state and
 * artifacts) and the debug logs, transcripts and session data of each CLI the task runs, delegating
 * the actual capture to the {@link ContainerLogCollector}.
 *
 * @param logs       The log collector to register sources on.
 * @param profile    Agent profile providing paths (audit log, etc.).
 * @param taskId     Task id used as the filename prefix.
 * @param workItemId Work item id the task's state and artifacts live under.
 * @param callbacks  Optional real-time line callbacks for streamed sources.
 * @param runtimes   Runtimes of the CLIs the task's container stages run; each adds its own sources.
 */
export function registerLogSources(
  logs: IContainerLogCollector,
  profile: IAgentProfile,
  taskId: string,
  workItemId: string,
  callbacks: LogSourceCallbacks,
  runtimes: readonly ICliRuntime[],
): void {
  logs.setTaskId(taskId);

  logs.addSource({
    id: "audit",
    service: "app",
    containerPath: profile.auditLogPath,
    extension: "jsonl",
    mode: CaptureMode.Collect,
  });

  logs.addSource({
    id: "pre-tool",
    service: "app",
    containerPath: PRE_TOOL_PATH,
    extension: "log",
    mode: callbacks.onPreToolUse ? CaptureMode.Stream : CaptureMode.Collect,
    onLine: callbacks.onPreToolUse,
  });

  logs.addSource({
    id: "tool-output",
    service: "app",
    containerPath: TOOL_OUTPUT_PATH,
    extension: "log",
    mode: callbacks.onToolOutput ? CaptureMode.Stream : CaptureMode.Collect,
    onLine: callbacks.onToolOutput,
  });

  logs.addSource({
    id: "proxy",
    service: "egress-proxy",
    containerPath: "/var/log/squid/access.log",
    extension: "log",
    mode: CaptureMode.Collect,
  });

  logs.addSource({
    id: "sidecar",
    service: "mcp-sidecar",
    containerPath: "",
    extension: "log",
    mode: CaptureMode.Stream,
    useComposeLogs: true,
  });

  logs.addSource({
    id: "state",
    service: "app",
    containerPath: `/workspace/.ralph/tasks/${workItemId}/state.md`,
    extension: "md",
    mode: CaptureMode.Collect,
    keepAcrossStages: true,
  });

  logs.addExport({
    id: "artifacts",
    service: "app",
    containerPath: `/workspace/.ralph/tasks/${workItemId}/artifacts`,
  });

  for (const runtime of runtimes) {
    const { sources, exports } = runtime.logSources(callbacks.onCliDebug);
    for (const source of sources) logs.addSource(source);
    for (const folder of exports) logs.addExport(folder);
  }

  logs.attach();
}
