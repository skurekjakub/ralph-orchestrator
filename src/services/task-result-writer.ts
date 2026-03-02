import type { RalphResult } from "../container/types.js";
import type { Logger } from "../logger.js";
import type { IContainerManager } from "../container/manager.js";
import type { ILogCollector } from "../logs/collector.js";
import type { IResourceManager } from "./task-resource-manager.js";
import type { TaskContext } from "./task-context.js";

/** Collects container logs, attaches transcripts, and saves execution summaries. */
export interface ITaskResultWriter {
  /** Collect all container logs and record their paths on the result. */
  collectLogs(container: IContainerManager, result: RalphResult): Promise<void>;
  /** Full result collection: logs + transcript attachment + execution summary. */
  collectResults(ctx: TaskContext, container: IContainerManager, result: RalphResult): Promise<void>;
}

export class TaskResultWriter implements ITaskResultWriter {
  private readonly logCollector: ILogCollector;
  private readonly resources: IResourceManager;
  private readonly logger: Logger;

  constructor({ logCollector, resources, logger }: {
    logCollector: ILogCollector;
    resources: IResourceManager;
    logger: Logger;
  }) {
    this.logCollector = logCollector;
    this.resources = resources;
    this.logger = logger;
  }

  async collectLogs(container: IContainerManager, result: RalphResult): Promise<void> {
    // For multi-stage pipelines, per-stage logs are already collected in the
    // stage loop. Merge them into the final result and run a final collection
    // for any residual logs (e.g. sidecar output that spans all stages).
    if (result.stageResults?.length) {
      for (const stage of result.stageResults) {
        for (const [id, path] of Object.entries(stage.collectedLogs)) {
          result.collectedLogs[`${stage.role}-${id}`] = path;
        }
      }
    }

    // Final collection picks up anything not yet per-stage-collected
    // (sidecar logs, session state exports, etc.) or serves as the
    // sole collection for single-stage pipelines.
    const collected = await container.logs.collectAll().catch(() => []);
    for (const { id, path } of collected) {
      if (path) result.collectedLogs[id] = path;
    }
  }

  async collectResults(ctx: TaskContext, container: IContainerManager, result: RalphResult): Promise<void> {
    this.logger.info("Collecting logs from containers...");
    await this.collectLogs(container, result);

    const transcriptPath = result.collectedLogs["transcript"];
    if (transcriptPath) {
      await this.resources.attachTranscript(ctx.workItem.source, ctx.workItem.id, transcriptPath, ctx.profile.agentName);
    }

    this.logCollector.saveExecutionSummary(result, undefined, ctx.taskId);
    this.logger.info("Execution summary saved");
  }
}
