import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import type { CliRunArtifacts, ICliRuntimeRegistry } from "../cli/cli-runtime";
import type { RunTelemetry } from "../cli/telemetry/run-telemetry";
import type { CliType } from "../config/types";
import type { RalphResult } from "../container/types";
import type { Logger } from "../logger";
import type { ITextRedactor } from "../logs/text-redactor";
import { redactTranscript, type TranscriptLine } from "../logs/transcript";
import { toErrorMessage } from "../util/error";
import type { TaskContext } from "./task-context";

/** Log id of the transcript attached to the work item. */
const TRANSCRIPT_LOG_ID = "transcript";

/** Whether a collected log id names a transcript a CLI wrote: the task's, or one stage's (`<role>-transcript`). */
function isCollectedTranscript(id: string): boolean {
  return id === TRANSCRIPT_LOG_ID || id.endsWith(`-${TRANSCRIPT_LOG_ID}`);
}

/** Derives the artifacts the host builds from a task's collected logs. */
export interface IRunArtifactsDeriver {
  /**
   * Redacts in place every transcript the CLIs wrote themselves, then writes, next to the collected logs,
   * a redacted transcript for each CLI that writes none of its own and each CLI's run telemetry, and
   * records them on `result.collectedLogs`. A derived transcript takes the `transcript` id, which is
   * attached to the work item, unless a CLI's own transcript holds it; it then takes `<cli>-transcript`.
   * Telemetry takes `<cli>-run-telemetry`. Each file is named `<taskId>-<ts>-<id>` in the task's output
   * directory, `.md` for a transcript and `.json` for telemetry.
   *
   * Never throws. A transcript that cannot be redacted is neither written nor kept in `collectedLogs`, so
   * it is never attached; any other failure is logged and skips only its own artifact.
   */
  derive(ctx: TaskContext, result: RalphResult): Promise<void>;
}

/** Derives transcripts and telemetry through each container CLI's runtime and redacts every transcript. */
export class RunArtifactsDeriver implements IRunArtifactsDeriver {
  private readonly cliRuntimes: ICliRuntimeRegistry;
  private readonly textRedactor: ITextRedactor;
  private readonly logger: Logger;

  constructor({
    cliRuntimes,
    textRedactor,
    logger,
  }: {
    cliRuntimes: ICliRuntimeRegistry;
    textRedactor: ITextRedactor;
    logger: Logger;
  }) {
    this.cliRuntimes = cliRuntimes;
    this.textRedactor = textRedactor;
    this.logger = logger;
  }

  async derive(ctx: TaskContext, result: RalphResult): Promise<void> {
    await this.redactCollectedTranscripts(result.collectedLogs);

    const collected = { ...result.collectedLogs };
    const prefix = join(ctx.outputDir, `${ctx.taskId}-${Date.now()}`);
    for (const runtime of this.cliRuntimes.forClis(ctx.profile.containerClis)) {
      let artifacts: CliRunArtifacts;
      try {
        artifacts = await runtime.deriveRunArtifacts(collected);
      } catch (err) {
        this.logger.warn(`Deriving the ${runtime.cli} transcript and telemetry failed: ${toErrorMessage(err)}`);
        continue;
      }
      if (artifacts.transcript !== null) {
        await this.saveTranscript(result.collectedLogs, runtime.cli, artifacts.transcript, prefix);
      }
      if (artifacts.telemetry !== null) {
        await this.saveTelemetry(result.collectedLogs, artifacts.telemetry, prefix);
      }
    }
  }

  private async redactCollectedTranscripts(collectedLogs: Record<string, string>): Promise<void> {
    for (const [id, path] of Object.entries(collectedLogs).filter(([logId]) => isCollectedTranscript(logId))) {
      try {
        await writeFile(path, await this.textRedactor.redact(await readFile(path, "utf-8")));
        this.logger.info(`${id} log redacted: ${path}`);
      } catch (err) {
        delete collectedLogs[id];
        this.logger.error(`Redacting the ${id} log failed, so it is not attached: ${toErrorMessage(err)}`);
      }
    }
  }

  private async saveTranscript(
    collectedLogs: Record<string, string>,
    cli: CliType,
    lines: readonly TranscriptLine[],
    prefix: string,
  ): Promise<void> {
    const id = TRANSCRIPT_LOG_ID in collectedLogs ? `${cli}-${TRANSCRIPT_LOG_ID}` : TRANSCRIPT_LOG_ID;
    const path = `${prefix}-${id}.md`;
    try {
      const redacted = await redactTranscript(lines, this.textRedactor);
      await mkdir(dirname(path), { recursive: true });
      await writeFile(path, redacted);
      collectedLogs[id] = path;
      this.logger.info(`${cli} transcript saved: ${path}`);
    } catch (err) {
      this.logger.error(`Saving the ${cli} transcript failed, so it is not attached: ${toErrorMessage(err)}`);
    }
  }

  private async saveTelemetry(
    collectedLogs: Record<string, string>,
    telemetry: RunTelemetry,
    prefix: string,
  ): Promise<void> {
    const id = `${telemetry.cli}-run-telemetry`;
    const path = `${prefix}-${id}.json`;
    try {
      await mkdir(dirname(path), { recursive: true });
      await writeFile(path, JSON.stringify(telemetry, null, 2));
      collectedLogs[id] = path;
      this.logger.info(`${telemetry.cli} run telemetry saved: ${path}`);
    } catch (err) {
      this.logger.warn(`Saving the ${telemetry.cli} run telemetry failed: ${toErrorMessage(err)}`);
    }
  }
}
