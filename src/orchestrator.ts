import type { AppConfig } from "./config.js";
import { JiraClient } from "./jira/client.js";
import { JiraPoller } from "./jira/poller.js";
import { TaskQueue } from "./queue.js";
import { ContainerManager } from "./container/manager.js";
import { LogCollector } from "./logs/collector.js";
import type { JiraIssue } from "./jira/types.js";
import type { RalphResult } from "./container/types.js";

export interface OrchestratorState {
  status: "idle" | "polling" | "working" | "stopping";
  currentIssue: { key: string; summary: string } | null;
  startedAt: number | null;
  completedToday: CompletedTask[];
  queueSize: number;
  queueItems: readonly { key: string; summary: string }[];
}

export interface CompletedTask {
  key: string;
  summary: string;
  status: RalphResult["status"];
  durationMs: number;
  prUrl?: string;
}

export class Orchestrator {
  private jiraClient: JiraClient;
  private poller: JiraPoller;
  private queue: TaskQueue;
  private container: ContainerManager;
  private logCollector: LogCollector;

  private busy = false;
  private running = false;
  private currentIssue: JiraIssue | null = null;
  private workStartedAt: number | null = null;
  private completedToday: CompletedTask[] = [];
  private stateCallback: ((state: OrchestratorState) => void) | null = null;

  constructor(private config: AppConfig) {
    this.jiraClient = new JiraClient(
      config.jira,
      config.secrets.jiraEmail,
      config.secrets.jiraPat
    );

    this.queue = new TaskQueue();
    this.container = new ContainerManager(config);
    this.logCollector = new LogCollector(config.output);

    this.poller = new JiraPoller(
      this.jiraClient,
      config.jira,
      (issues) => this.onIssuesFound(issues)
    );
  }

  /** Subscribe to state changes for the dashboard */
  onStateChange(callback: (state: OrchestratorState) => void): void {
    this.stateCallback = callback;
  }

  /** Get current state snapshot */
  getState(): OrchestratorState {
    return {
      status: !this.running
        ? "stopping"
        : this.busy
          ? "working"
          : "idle",
      currentIssue: this.currentIssue
        ? {
            key: this.currentIssue.key,
            summary: this.currentIssue.fields.summary,
          }
        : null,
      startedAt: this.workStartedAt,
      completedToday: [...this.completedToday],
      queueSize: this.queue.size,
      queueItems: this.queue.items,
    };
  }

  /** Start the orchestrator loop */
  async start(): Promise<void> {
    this.running = true;
    this.poller.start();
    this.emitState();

    console.log("[ORCHESTRATOR] Started. Polling JIRA...");

    while (this.running) {
      if (this.busy) {
        await sleep(5000);
        continue;
      }

      const issue = this.queue.dequeue();
      if (!issue) {
        await sleep(5000);
        continue;
      }

      await this.processIssue(issue);
    }

    this.poller.stop();
    console.log("[ORCHESTRATOR] Stopped.");
  }

  /** Gracefully stop the orchestrator */
  stop(): void {
    this.running = false;
    this.emitState();
  }

  private async processIssue(issue: JiraIssue): Promise<void> {
    this.busy = true;
    this.currentIssue = issue;
    this.workStartedAt = Date.now();
    this.emitState();

    console.log(`[ORCHESTRATOR] Processing ${issue.key}: ${issue.fields.summary}`);

    try {
      // 1. Transition to In Progress + comment on JIRA
      await this.jiraClient
        .transitionIssue(issue.key, this.config.jira.inProgressTransitionId)
        .catch((err) =>
          console.error(`[ORCHESTRATOR] Failed to transition ${issue.key}:`, err)
        );

      await this.jiraClient
        .addComment(
          issue.key,
          `🤖 Ralph is starting work on this issue.\nBranch: ralph/${issue.key.toLowerCase()}`
        )
        .catch((err) =>
          console.error(`[ORCHESTRATOR] Failed to comment on ${issue.key}:`, err)
        );

      // 2. Start the container
      await this.container.start();

      // 3. Clean previous logs
      await this.container.cleanLogs();

      // 4. Execute Ralph
      const result = await this.container.execute(issue);

      // 5. Collect artifacts
      result.auditLogPath =
        (await this.container.collectLogs(issue.key)) ?? undefined;
      result.handoffPath =
        (await this.container.collectHandoff(issue.key)) ?? undefined;

      // 6. Save execution summary
      this.logCollector.saveExecutionSummary(result);

      // 7. Comment on JIRA with results
      await this.jiraClient
        .addComment(issue.key, this.formatCompletionComment(result))
        .catch((err) =>
          console.error(
            `[ORCHESTRATOR] Failed to post completion comment on ${issue.key}:`,
            err
          )
        );

      // 8. Track completion
      this.completedToday.push({
        key: issue.key,
        summary: issue.fields.summary,
        status: result.status,
        durationMs: result.durationMs,
        prUrl: result.prUrl,
      });

      console.log(
        `[ORCHESTRATOR] Finished ${issue.key}: ${result.status} (${Math.round(result.durationMs / 1000)}s)`
      );
    } catch (err) {
      console.error(`[ORCHESTRATOR] Error processing ${issue.key}:`, err);

      await this.jiraClient
        .addComment(
          issue.key,
          `🤖 Ralph encountered an error and could not complete this task.\nError: ${err instanceof Error ? err.message : String(err)}`
        )
        .catch(() => {});

      this.completedToday.push({
        key: issue.key,
        summary: issue.fields.summary,
        status: "error",
        durationMs: Date.now() - (this.workStartedAt ?? Date.now()),
      });
    } finally {
      // 9. Stop the container
      await this.container.stop().catch((err) =>
        console.error("[ORCHESTRATOR] Failed to stop container:", err)
      );

      this.busy = false;
      this.currentIssue = null;
      this.workStartedAt = null;
      this.queue.markProcessed(issue.key);
      this.emitState();
    }
  }

  private onIssuesFound(issues: JiraIssue[]): void {
    let added = 0;
    for (const issue of issues) {
      if (this.queue.enqueue(issue)) {
        added++;
        console.log(
          `[POLLER] Enqueued ${issue.key}: ${issue.fields.summary}`
        );
      }
    }
    if (added > 0) {
      this.emitState();
    }
  }

  private emitState(): void {
    this.stateCallback?.(this.getState());
  }

  private formatCompletionComment(result: RalphResult): string {
    const durationStr = formatDuration(result.durationMs);
    const statusEmoji =
      result.status === "completed"
        ? "✅"
        : result.status === "partial"
          ? "⚠️"
          : "❌";

    const lines = [
      `🤖 Ralph has finished working on this task.`,
      ``,
      `**Status:** ${statusEmoji} ${result.status}`,
      `**Duration:** ${durationStr}`,
    ];

    if (result.prUrl) {
      lines.push(`**Pull Request:** ${result.prUrl}`);
    }

    lines.push(
      ``,
      `See the PR description and handoff file for full details.`
    );

    return lines.join("\n");
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function formatDuration(ms: number): string {
  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;
  if (minutes === 0) return `${remainingSeconds}s`;
  return `${minutes}m ${remainingSeconds}s`;
}
