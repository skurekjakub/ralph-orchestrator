import { resolve } from "node:path";
import { execa } from "execa";
import type { AgentProfile } from "./config.js";
import { OperationStatus } from "./services/operation-ledger.js";
import type { Operation } from "./services/operation-ledger.js";
import { OrchestratorComments } from "./services/orchestrator-comments.js";
import { OrchestratorObserver } from "./orchestrator-observer.js";
import { resolveAllProfileIncludes } from "./container/agent-includes.js";
import type { JiraIssue } from "./jira/types.js";
import type { ActiveTask, OrchestratorDeps } from "./orchestrator-types.js";

/**
 * Main orchestration loop.
 *
 * Wires together the JIRA poller, profile router, task runner, and activity log.
 * Processes one JIRA issue at a time:
 *
 * 1. Poll JIRA -> enqueue matching issues
 * 2. Dequeue -> route to matching profile
 * 3. Delegate to TaskRunner (transitions, container, agent, logs)
 * 4. Track completion and emit state updates
 *
 * The loop is event-driven: it awaits a {@link workSignal} that the
 * {@link JiraPoller} and {@link OperationLedger} resolve when new work arrives.
 * No polling / sleep timers inside the loop.
 *
 * All heavy lifting is delegated to focused services:
 * - {@link ActivityLog} -- ring buffer + persistent JSONL
 * - {@link ProfileRouter} -- issue -> profile matching
 * - {@link TaskRunner} -- single-issue pipeline
 */
export class Orchestrator {
  private deps: OrchestratorDeps;

  private activeTask: ActiveTask | null = null;
  private running = false;
  readonly observer: OrchestratorObserver;

  /**
   * Resettable promise resolved by the poller / ledger / stop signal.
   * The main loop awaits this instead of sleeping on a fixed interval.
   */
  private workSignalResolve: (() => void) | null = null;

  constructor(deps: OrchestratorDeps) {
    this.deps = deps;

    this.observer = new OrchestratorObserver(() => ({
      activeTask: this.activeTask,
      running: this.running,
      pendingOps: this.deps.ledger.getAllPending().map((p) => ({
        issueKey: p.issueKey,
        variant: p.operation.variant,
      })),
      logEntries: this.deps.activityLog.entries,
      profileIds: this.deps.router.profileIds,
    }));

    this.deps.ledger.onPending(() => this.wakeUp());
    this.deps.poller.onIssues(() => this.wakeUp());
  }

  /**
   * Resolve the current work signal, waking the main loop.
   * Safe to call multiple times — only the first resolve has effect.
   */
  private wakeUp(): void {
    this.workSignalResolve?.();
  }

  /** Return a promise that resolves on the next {@link wakeUp} call. */
  private waitForWork(): Promise<void> {
    return new Promise<void>((resolve) => {
      this.workSignalResolve = resolve;
    });
  }

  /** Push state snapshot to all listeners (dashboard, tests, heartbeat). */
  private emitState(): void {
    this.observer.emit();
  }

  /** Start the orchestrator loop. */
  async start(): Promise<void> {
    this.running = true;

    resolveAllProfileIncludes();
    this.log("Resolved agent include markers");

    this.deps.poller.start();

    if (this.deps.heartbeat) {
      this.deps.heartbeat.start(() => this.observer.getHeartbeatPayload());
      this.log("Dashboard heartbeat enabled");
    }

    this.log("Orchestrator started -- polling JIRA for new tasks");
    this.log(`Agent ID: ${this.observer.agentId}`);
    this.log(`Poll interval: ${this.deps.config.jira.pollIntervalMs / 1000}s`);
    this.log(`JQL queries: ${this.deps.config.jira.jql.length}`);
    this.log(`Agent profiles: ${this.deps.router.profileIds.join(", ")}`);

    const recovered = this.deps.ledger.recoverActiveOperations();
    for (const { issueKey, operation } of recovered) {
      this.warn(
        `Recovered crashed operation on ${issueKey} (variant: ${operation.variant}) — marked as error`,
      );
      await this.deps.jiraClient
        .addComment(
          issueKey,
          OrchestratorComments.crashRecovery(operation.variant.split(":")[1]),
        )
        .catch(() => {});
    }

    while (this.running) {
      const discovered = this.deps.poller.drain();
      if (discovered.length > 0) {
        const planned = await this.deps.triggerScanner.scan(
          discovered,
          this.deps.config.profiles,
        );
        if (planned > 0) this.emitState();
      }

      const pending = this.deps.ledger.getAllPending();
      if (pending.length === 0) {
        await this.waitForWork();
        continue;
      }

      const next = pending[0];
      await this.executeOperation(next.issueKey, next.operation);
    }

    this.deps.poller.stop();
    this.log("Orchestrator stopped");
  }

  /** Signal the main loop to stop after the current iteration. */
  stop(): void {
    this.running = false;
    this.wakeUp();
    this.emitState();
  }

  /** Full graceful shutdown -- stops poller, kills container if busy, cleans up. */
  async shutdown(): Promise<void> {
    this.log("Shutting down gracefully...");
    this.running = false;
    this.deps.poller.stop();
    this.deps.heartbeat?.stop();
    this.wakeUp();
    this.emitState();

    if (this.activeTask) {
      this.log("Task in progress -- stopping container...");
      await this.teardownContainer(this.activeTask.profile);
    }

    this.log("Shutdown complete");
  }

  /**
   * Execute a single pending operation: transition → agent → record result.
   *
   * Re-validates the issue's current JIRA status before executing — if the
   * status changed since planning, the operation is rejected.
   */
  private async executeOperation(
    issueKey: string,
    operation: Operation,
  ): Promise<void> {
    const profile = this.deps.config.profiles.find(
      (p) => p.variantKey === operation.variant,
    );
    if (!profile) {
      this.log(`Operation on ${issueKey} failed: profile ${operation.variant} no longer exists`);
      this.deps.ledger.transition(issueKey, operation.id, OperationStatus.Error, {
        reason: `Profile ${operation.variant} no longer exists`,
      });
      this.emitState();
      return;
    }

    let issue: JiraIssue;
    try {
      const results = await this.deps.jiraClient.searchIssues(
        `key = ${issueKey}`,
        1,
      );
      if (results.length === 0) {
        this.log(`Operation on ${issueKey} failed: issue not found in JIRA`);
        this.deps.ledger.transition(issueKey, operation.id, OperationStatus.Error, {
          reason: "Issue not found in JIRA",
        });
        this.emitState();
        return;
      }
      issue = results[0];
    } catch (err) {
      this.log(`Operation on ${issueKey} failed: ${err instanceof Error ? err.message : String(err)}`);
      this.deps.ledger.transition(issueKey, operation.id, OperationStatus.Error, {
        reason: `Failed to fetch issue: ${err instanceof Error ? err.message : String(err)}`,
      });
      this.emitState();
      return;
    }

    if (!this.deps.router.matchesProjectAndStatus(issue, profile)) {
      this.log(
        `Rejected ${issueKey}: status "${issue.fields.status.name}" no longer matches profile ${profile.displayName}`,
      );
      this.deps.ledger.transition(issueKey, operation.id, OperationStatus.Rejected, {
        reason: `Issue status "${issue.fields.status.name}" no longer matches profile`,
      });
      await this.deps.jiraClient
        .addComment(
          issueKey,
          OrchestratorComments.staleStatus(
            profile.displayName,
            issue.fields.status.name,
          ),
        )
        .catch(() => {});
      this.emitState();
      return;
    }

    if (profile.preflight) {
      const { buildPreflightContext, runPreflight } =
        await import("./services/preflight.js");
      const comments = await this.deps.jiraClient
        .getComments(issueKey)
        .catch(() => []);
      const ctx = await buildPreflightContext(
        this.deps.jiraClient,
        issueKey,
        comments,
      );
      const result = runPreflight(profile.preflight, issue, ctx);
      if (!result.ok) {
        const comment =
          profile.failureComment ??
          `[Ralph-Orchestrator] ${profile.displayName} can't proceed: ${result.reason}`;
        this.deps.ledger.transition(
          issueKey,
          operation.id,
          OperationStatus.Rejected,
          {
            reason: `preflight:${profile.preflight} — ${result.reason}`,
          },
        );
        await this.deps.jiraClient.addComment(issueKey, comment).catch(() => {});
        this.log(
          `Preflight failed for ${issue.key} (${profile.preflight}): ${result.reason}`,
        );
        return;
      }
    }

    this.activeTask = {
      issue,
      profile,
      container: null,
      startedAt: Date.now(),
    };

    this.log(
      `Picked up ${issue.key}: ${issue.fields.summary} (${operation.variant})`,
    );
    this.deps.ledger.transition(issueKey, operation.id, OperationStatus.Active);

    try {
      this.deps.activityLog.startTaskLog(issue.key);
      const { result, container } = await this.deps.taskRunner.run(issue, profile);
      this.activeTask.container = container;

      this.observer.recordCompletion({
        key: issue.key,
        summary: issue.fields.summary,
        profileId: profile.id,
        status: result.status,
        durationMs: result.durationMs || Date.now() - this.activeTask.startedAt,
        prUrl: result.prUrl,
        completedAt: Date.now(),
      });

      this.log(
        `Done ${issue.key}: ${result.status} (${Math.round((result.durationMs || 0) / 1000)}s)`,
      );

      this.deps.ledger.transition(
        issueKey,
        operation.id,
        OperationStatus.Completed,
        {
          resultStatus: result.status,
        },
      );

      if (result.status === "completed" || result.status === "partial") {
        await this.deps.taskRunner.transitionAfterAgent(issue.key, profile);
      } else if (result.status === "error" || result.status === "blocked") {
        await this.deps.taskRunner.postErrorComment(
          issue.key,
          result.stderr || `Agent finished with status: ${result.status}`,
        );
      }
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      this.logError(`Error processing ${issue.key}: ${errorMsg}`);

      this.observer.recordCompletion({
        key: issue.key,
        summary: issue.fields.summary,
        profileId: profile.id,
        status: "error",
        durationMs: Date.now() - this.activeTask.startedAt,
        completedAt: Date.now(),
      });

      this.deps.ledger.transition(issueKey, operation.id, OperationStatus.Error, {
        reason: errorMsg,
      });

      await this.deps.taskRunner.postErrorComment(issue.key, errorMsg);
    } finally {
      this.deps.activityLog.endTaskLog();
      await this.teardownContainer(profile);
      this.resetTaskState();
    }
  }

  /**
   * Guarantee container teardown regardless of how the task ended.
   *
   * First tries a graceful `container.stop()` via the active container reference.
   * If that fails or wasn't available, falls back to a raw `docker compose down`
   * using the profile's compose file path — this catches containers that were
   * started but never returned to the orchestrator (e.g. crash during setup).
   */
  private async teardownContainer(profile: AgentProfile): Promise<void> {
    this.log("Stopping containers...");

    if (this.activeTask?.container) {
      try {
        await this.activeTask.container.stop();
        this.log("Containers stopped");
        return;
      } catch (err) {
        this.warn(
          `Graceful stop failed: ${err instanceof Error ? err.message : String(err)}`,
        );
      }
    }

    // Fallback: raw docker compose down using the profile's compose file + security overlay.
    // Must inject the same env vars as ComposeClient — compose files reference
    // TARGET_REPO_PATH, SHARED_HOOKS_PATH, etc. in volume mounts.
    const composeFile = resolve(process.cwd(), profile.composeFile);
    const securityOverlay = resolve(process.cwd(), "shared/security/docker-compose.security.yml");
    const { secrets, jira } = this.deps.config;
    try {
      await execa("docker", [
        "compose",
        "-f",
        composeFile,
        "-f",
        securityOverlay,
        "down",
        "--volumes",
        "--remove-orphans",
      ], {
        env: {
          ...process.env as Record<string, string>,
          TARGET_REPO_PATH: resolve(profile.repoPath),
          SHARED_HOOKS_PATH: resolve(process.cwd(), "shared/hooks"),
          SQUID_CONF_PATH: resolve(process.cwd(), "shared/security/squid.conf"),
          GH_TOKEN: secrets.ghToken,
          ADO_PAT_DOCS: secrets.adoPatDocs,
          ADO_PAT_XPERIENCE: secrets.adoPatXperience,
          JIRA_PAT: secrets.jiraPat,
          JIRA_EMAIL: secrets.jiraEmail,
          JIRA_BASE_URL: jira.baseUrl,
          JIRA_CLOUD_ID: jira.cloudId,
          ANTHROPIC_API_KEY: secrets.anthropicApiKey,
        },
      });
      this.log("Containers stopped (fallback)");
    } catch (err) {
      this.warn(
        `Fallback teardown failed: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  /** Reset all per-task state and emit an update. */
  private resetTaskState(): void {
    this.activeTask = null;
    this.emitState();
  }

  private log(message: string): void {
    this.deps.activityLog.push("info", message);
    this.emitState();
  }
  private warn(message: string): void {
    this.deps.activityLog.push("warn", message);
    this.emitState();
  }
  private logError(message: string): void {
    this.deps.activityLog.push("error", message);
    this.emitState();
  }
}
