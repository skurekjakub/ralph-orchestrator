import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { ResultPromise } from "execa";
import type { IComposeClient } from "./compose-client.js";
import type { Logger } from "../logger.js";

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
  /** Optional callback invoked for each streamed line (only used in `"stream"` mode). */
  onLine?: (line: string) => void;
}

/** Result of collecting a single log source. */
export interface CollectedLog {
  /** The source `id` from the definition. */
  id: string;
  /** Local filesystem path to the saved file, or `null` if nothing was captured. */
  path: string | null;
}

/**
 * Manages log collection from one or more Docker Compose services for a single task.
 *
 * Attach log sources via {@link addSource}, then call {@link attach} after the
 * containers are running to start any streamed sources. After the task finishes,
 * call {@link collectAll} to flush everything to the local output directory.
 * Call {@link detach} to stop streaming before container teardown.
 *
 * File naming: `<issueKey>-<timestamp>-<sourceId>.<extension>`
 */
export class ContainerLogCollector {
  private readonly sources: LogSourceDef[] = [];
  private readonly streamProcs = new Map<string, ResultPromise>();
  private attached = false;
  private issueKey: string | null = null;

  /**
   * @param compose  Compose client for executing commands inside containers.
   * @param logDir   Local directory where collected logs are written.
   * @param logger   Logger for status messages.
   */
  constructor(
    private readonly compose: IComposeClient,
    private readonly logDir: string,
    private readonly logger: Logger,
  ) {
    mkdirSync(logDir, { recursive: true });
  }

  /** Set the JIRA issue key used as the filename prefix. Must be called before {@link collectAll}. */
  setIssueKey(key: string): void {
    this.issueKey = key;
  }

  /** Register a log source to be collected. Can be called before or after {@link attach}. */
  addSource(source: LogSourceDef): void {
    this.sources.push(source);
    if (this.attached && source.mode === CaptureMode.Stream) {
      this.startStream(source);
    }
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
   * @returns Array of collection results (one per source).
   */
  async collectAll(): Promise<CollectedLog[]> {
    if (!this.issueKey) {
      throw new Error("Issue key not set — call setIssueKey() before collectAll()");
    }

    const timestamp = Date.now();
    const issueDir = join(this.logDir, this.issueKey);
    mkdirSync(issueDir, { recursive: true });
    const results: CollectedLog[] = [];

    for (const source of this.sources) {
      const localPath = join(
        issueDir,
        `${this.issueKey}-${timestamp}-${source.id}.${source.extension}`,
      );

      try {
        const collectCmd = source.collectArgs ?? ["cat", source.containerPath];
        const result = await this.compose.exec([
          "-T", source.service, ...collectCmd,
        ]);

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

    return results;
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
      const proc = this.compose.exec([
        "--user", "vscode", source.service,
        "tail", "-n", "0", "-f", source.containerPath,
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

      proc.catch(() => {
        // tail exits when the container stops — expected
      });
    } catch {
      this.logger.warn(`Failed to start streaming ${source.id}`);
    }
  }
}
