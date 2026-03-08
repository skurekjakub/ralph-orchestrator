import type { IAgentProfile } from "../config/types.js";
import { CaptureMode, type IContainerLogCollector } from "./log-collector.js";
import type { CliPaths } from "./types.js";

/** Path to the CLI session-state directory inside the container. */
const SESSION_STATE_PATH = "/workspace/.ralph/session-state";
const SESSION_STATE_DB = "/workspace/.ralph/session-store.db";

/** Optional callbacks wired into streamed log sources. */
export interface LogSourceCallbacks {
  /** Invoked for each line of real-time tool output. */
  onToolOutput?: (line: string) => void;
  /** Invoked for each line of real-time pre-tool invocation output. */
  onPreToolUse?: (line: string) => void;
  /** Invoked for each line of real-time CLI debug log output. */
  onCliDebug?: (line: string) => void;
}

/** Public contract for registering standard log sources on a task. */
export interface ILogSourceRegistry {
  /**
   * Register all standard log sources on the collector and start streaming.
   *
   * @param logs       The log collector to register sources on.
   * @param profile    Agent profile providing paths (audit log, etc.).
   * @param taskId     Work item id used as the filename prefix.
   * @param callbacks  Optional real-time line callbacks for streamed sources.
   * @param cliPaths   CLI-specific filesystem paths.
   */
  registerAll(
    logs: IContainerLogCollector,
    profile: IAgentProfile,
    taskId: string,
    workItemId: string,
    callbacks: LogSourceCallbacks,
    cliPaths: CliPaths,
  ): void;
}

/**
 * Encapsulates the registration of all standard log sources for a task.
 *
 * Knows about audit logs, transcripts, tool output, proxy logs, CLI debug
 * logs, and the MCP sidecar — delegating the actual capture to the
 * {@link ContainerLogCollector}.
 */
export class LogSourceRegistry implements ILogSourceRegistry {
  /** Path to the pre-tool invocation log inside the container. */
  static readonly PRE_TOOL_PATH = "/workspace/.ralph/logs/pre-tool.log";

  /** Path to the untruncated tool output log inside the container. */
  static readonly TOOL_OUTPUT_PATH = "/workspace/.ralph/logs/tool-output.log";

  registerAll(
    logs: IContainerLogCollector,
    profile: IAgentProfile,
    taskId: string,
    workItemId: string,
    callbacks: LogSourceCallbacks,
    cliPaths: CliPaths,
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
      id: "transcript",
      service: "app",
      containerPath: cliPaths.transcriptPath,
      extension: "md",
      mode: CaptureMode.Collect,
    });

    logs.addSource({
      id: "pre-tool",
      service: "app",
      containerPath: LogSourceRegistry.PRE_TOOL_PATH,
      extension: "log",
      mode: callbacks.onPreToolUse ? CaptureMode.Stream : CaptureMode.Collect,
      onLine: callbacks.onPreToolUse,
    });

    logs.addSource({
      id: "tool-output",
      service: "app",
      containerPath: LogSourceRegistry.TOOL_OUTPUT_PATH,
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
      id: "cli-debug",
      service: "app",
      containerPath: cliPaths.logDir,
      extension: "log",
      mode: callbacks.onCliDebug ? CaptureMode.Stream : CaptureMode.Collect,
      collectArgs: ["sh", "-c", `cat ${cliPaths.logDir}/*.log 2>/dev/null`],
      streamArgs: ["sh", "-c", `while ! ls ${cliPaths.logDir}/*.log >/dev/null 2>&1; do sleep 1; done; exec tail -n 0 -F ${cliPaths.logDir}/*.log`],
      onLine: callbacks.onCliDebug,
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
    });

    logs.addExport({
      id: "session-state",
      service: "app",
      containerPath: SESSION_STATE_PATH,
    });

    logs.addExport({
      id: "session-db",
      service: "app",
      containerPath: SESSION_STATE_DB,
    });

    logs.addExport({
      id: "artifacts",
      service: "app",
      containerPath: `/workspace/.ralph/tasks/${workItemId}/artifacts`,
    });

    logs.attach();
  }
}
