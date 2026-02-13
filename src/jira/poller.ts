import type { JiraConfig } from "../config.js";
import type { JiraClient } from "./client.js";
import type { JiraIssue } from "./types.js";

export type PollCallback = (issues: JiraIssue[]) => void;

export class JiraPoller {
  private timer: ReturnType<typeof setInterval> | null = null;
  private running = false;

  constructor(
    private client: JiraClient,
    private config: JiraConfig,
    private onIssuesFound: PollCallback
  ) {}

  start(): void {
    if (this.running) return;
    this.running = true;

    // Fire immediately, then on interval
    this.poll().catch(console.error);
    this.timer = setInterval(() => {
      this.poll().catch(console.error);
    }, this.config.pollIntervalMs);
  }

  stop(): void {
    this.running = false;
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  private async poll(): Promise<void> {
    try {
      const issues = await this.client.searchIssues(this.config.jql);
      if (issues.length > 0) {
        this.onIssuesFound(issues);
      }
    } catch (err) {
      console.error("[POLLER] JIRA poll failed:", err);
    }
  }
}
