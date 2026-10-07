import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { ResultPromise } from "execa";
import type { IComposeClient } from "./compose-client";
import type { IOutputConfig } from "../config/types";
import type { Logger } from "../logger";
import { toErrorMessage } from "../util/error";

/** How a log source should be captured. */
export enum CaptureMode {
  /** Start `tail -f` on attach for real-time output; collect the full file on flush. */
  Stream = "stream",
  /** Only read the file on flush — no real-time streaming. */
  Collect = "collect",
}

/** Definition of a single log source inside the container. */
export interface LogSourceDef {
  /** Short identifier used in filenames and log messages (e.g. `"proxy"`, `"audit"`). */
  id: string;
  /** Docker Compose service name that hosts the log file. */
  service: string;
  /** Absolute path to the log file inside the container. */
  containerPath: string;
  /** File extension for the local output file (without leading dot). */
  extension: string;
  /** {@link CaptureMode.Stream} starts `tail -f` on attach and collects the full file on flush;
   *  {@link CaptureMode.Collect} only reads the file on flush. */
  mode: CaptureMode;
  /** Override the default `["cat", containerPath]` command used during collection.
   *  Useful when the file has a dynamic name (e.g. glob pattern). */
  collectArgs?: string[];
  /** Override the default `["tail", "-n", "0", "-F", containerPath]` command used
   *  for streaming. Useful for directory-based sources (e.g. glob patterns). */
  streamArgs?: string[];
  /** When true, collect via `docker compose logs` instead of `exec cat`. Use for
   *  sidecar services that log to stdout rather than a file. */
  useComposeLogs?: boolean;
  /** Optional callback invoked for each streamed line (only used in `"stream"` mode). */
  onLine?: (line: string) => void;
  /** When true, {@link IContainerLogCollector.clearCollectSources} leaves the file alone. Use for
   *  files the agent carries from one pipeline stage to the next (e.g. its state file). */
  keepAcrossStages?: boolean;
}

/** Definition of a folder to export wholesale from the container via `docker compose cp`. */
export interface FolderExportDef {
  /** Short identifier used in filenames and log messages (e.g. `"session-state"`). */
  id: string;
  /** Docker Compose service name that hosts the folder. */
  service: string;
  /** Absolute path to the folder inside the container. */
  containerPath: string;
}

/** Result of collecting a single log source. */
export interface CollectedLog {
  /** The source `id` from the definition. */
  id: string;
  /** Local filesystem path to the saved file or directory, or `null` if nothing was captured. */
  path: string | null;
}

/** Public contract for container log collection. */
export interface IContainerLogCollector {
  /** Set the work item key used as the filename prefix. */
  setTaskId(key: string): void;
  /** Register a log source to be collected. */
  addSource(source: LogSourceDef): void;
  /** Register a folder to be exported wholesale from the container after the task. */
  addExport(folder: FolderExportDef): void;
  /** Start streaming for all `"stream"` mode sources. */
  attach(): void;
  /** Stop all active streaming processes. */
  detach(): void;
  /**
   * Flush all log sources to disk.
   *
   * @param stageLabel  Optional stage identifier (e.g. `"researcher"`) inserted
   *                    into filenames: `<taskId>-<ts>-<stageLabel>-<sourceId>.<ext>`.
   *                    Omit for single-stage pipelines or the final collection.
   */
  collectAll(stageLabel?: string): Promise<CollectedLog[]>;
  /**
   * Truncate container-side log files for all collect-mode sources.
   *
   * Call between pipeline stages so the next stage starts with fresh files.
   * Stream-mode, compose-logs and {@link LogSourceDef.keepAcrossStages}
   * sources are skipped (they're continuously tailed, append-only container
   * stdout, or state the next stage needs).
   */
  clearCollectSources(): Promise<void>;
}

/**
 * Manages log collection from one or more Docker Compose services for a single task.
 *
 * Attach log sources via {@link addSource}, then call {@link attach} after the
 * containers are running to start any streamed sources. After the task finishes,
 * call {@link collectAll} to flush everything to the local output directory.
 * Call {@link detach} to stop streaming before container teardown.
 *
 * File naming: `<taskId>-<timestamp>-<sourceId>.<extension>`
 */
export class ContainerLogCollector implements IContainerLogCollector {
  private readonly sources: LogSourceDef[] = [];
  private readonly exports: FolderExportDef[] = [];
  private readonly streamProcs = new Map<string, ResultPromise>();
  private attached = false;
  private taskId: string | null = null;

  private readonly compose: IComposeClient;
  private readonly logDir: string;
  private readonly logger: Logger;

  /** @param deps.outputConfig Its `logDir` receives one directory per task. */
  constructor({
    compose,
    outputConfig,
    logger,
  }: {
    compose: IComposeClient;
    outputConfig: IOutputConfig;
    logger: Logger;
  }) {
    this.compose = compose;
    this.logDir = outputConfig.logDir;
    this.logger = logger;
    mkdirSync(this.logDir, { recursive: true });
  }

  /** Set the work item key used as the filename prefix. Must be called before {@link collectAll}. */
  setTaskId(key: string): void {
    this.taskId = key;
  }

  /** Register a log source to be collected. Can be called before or after {@link attach}. */
  addSource(source: LogSourceDef): void {
    this.sources.push(source);
    if (this.attached && source.mode === CaptureMode.Stream) {
      this.startStream(source);
    }
  }

  /** Register a folder to be exported wholesale from the container after the task. */
  addExport(folder: FolderExportDef): void {
    this.exports.push(folder);
  }

  /**
   * Start streaming for all `"stream"` mode sources.
   *
   * Call this after `docker compose up` when the containers are running.
   */
  attach(): void {
    this.attached = true;
    for (const source of this.sources) {
      if (source.mode === CaptureMode.Stream) {
        this.startStream(source);
      }
    }
  }

  /**
   * Flush all log sources to disk.
   *
   * For each source, reads the full file from the container via `cat` and writes
   * it locally. This captures everything — including content that arrived before
   * streaming started or after it was stopped.
   *
   * @param stageLabel  Optional stage identifier inserted into filenames.
   * @returns Array of collection results (one per source).
   */
  async collectAll(stageLabel?: string): Promise<CollectedLog[]> {
    if (!this.taskId) {
      throw new Error("Task ID not set — call setTaskId() before collectAll()");
    }

    const timestamp = Date.now();
    const issueDir = join(this.logDir, this.taskId);
    mkdirSync(issueDir, { recursive: true });
    const results: CollectedLog[] = [];

    const labelSegment = stageLabel ? `-${stageLabel}` : "";

    for (const source of this.sources) {
      const localPath = join(issueDir, `${this.taskId}-${timestamp}${labelSegment}-${source.id}.${source.extension}`);

      try {
        const result = source.useComposeLogs
          ? await this.compose.logs(source.service)
          : await this.compose.exec(["-T", source.service, ...(source.collectArgs ?? ["cat", source.containerPath])]);

        const content = String(result.stdout);
        if (!content.trim()) {
          this.logger.warn(`No ${source.id} log found`);
          results.push({ id: source.id, path: null });
          continue;
        }

        writeFileSync(localPath, content);
        this.logger.info(`${source.id} log saved: ${localPath}`);
        results.push({ id: source.id, path: localPath });
      } catch {
        this.logger.warn(`Failed to collect ${source.id} log`);
        results.push({ id: source.id, path: null });
      }
    }

    for (const folder of this.exports) {
      const localDir = join(issueDir, `${this.taskId}-${timestamp}${labelSegment}-${folder.id}`);
      try {
        await this.compose.compose(["cp", `${folder.service}:${folder.containerPath}`, localDir]);
        this.logger.info(`${folder.id} export saved: ${localDir}`);
        results.push({ id: folder.id, path: localDir });
      } catch {
        this.logger.warn(`Failed to export ${folder.id} folder`);
        results.push({ id: folder.id, path: null });
      }
    }

    return results;
  }

  /**
   * Truncate container-side log files for all collect-mode sources.
   *
   * Runs `truncate -s 0` inside the container for each source that uses
   * file-based collection (not compose-logs, stream-mode or
   * {@link LogSourceDef.keepAcrossStages}). Safe to call between pipeline
   * stages so the next stage starts with fresh log files.
   */
  async clearCollectSources(): Promise<void> {
    const fileSources = this.sources.filter(
      (s) => !s.useComposeLogs && s.containerPath && s.mode === CaptureMode.Collect && !s.keepAcrossStages,
    );
    for (const source of fileSources) {
      const truncatePath = source.collectArgs
        ? undefined // Custom collect commands (e.g. glob) — skip, not a single file
        : source.containerPath;
      if (!truncatePath) continue;
      try {
        await this.compose.exec([
          "-T",
          source.service,
          "sh",
          "-c",
          `truncate -s 0 ${truncatePath} 2>/dev/null || true`,
        ]);
      } catch {
        this.logger.warn(`Failed to clear ${source.id} log in container`);
      }
    }
  }

  /**
   * Stop all active streaming processes.
   *
   * Call this before container teardown. Safe to call multiple times.
   */
  detach(): void {
    for (const [id, proc] of this.streamProcs) {
      proc.kill();
      this.logger.info(`Stopped streaming ${id}`);
    }
    this.streamProcs.clear();
    this.attached = false;
  }

  private startStream(source: LogSourceDef): void {
    if (this.streamProcs.has(source.id)) return;

    try {
      const proc = source.useComposeLogs
        ? this.compose.compose(["logs", "-f", "--no-color", "--no-log-prefix", source.service])
        : this.compose.exec([
            "--user",
            "vscode",
            source.service,
            ...(source.streamArgs ?? ["tail", "-n", "0", "-F", source.containerPath]),
          ]);

      this.streamProcs.set(source.id, proc);

      if (source.onLine) {
        const cb = source.onLine;
        let buffer = "";
        proc.stdout?.on("data", (chunk: Buffer) => {
          buffer += chunk.toString();
          const lines = buffer.split("\n");
          buffer = lines.pop() ?? "";
          for (const line of lines) {
            cb(line);
          }
        });
      }

      proc.catch((err: unknown) => {
        // tail exits when the container stops — that's expected and not an error
        const msg = toErrorMessage(err);
        if (!msg.includes("Command failed") && !msg.includes("killed")) {
          this.logger.warn(`Stream process for ${source.id} exited unexpectedly: ${msg}`);
        }
      });
    } catch {
      this.logger.warn(`Failed to start streaming ${source.id}`);
    }
  }
}
