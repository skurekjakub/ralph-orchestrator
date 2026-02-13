import type { JiraIssue } from "./jira/types.js";

export interface JiraIssueRef {
  key: string;
  summary: string;
}

export class TaskQueue {
  private queue: JiraIssue[] = [];
  private seen = new Set<string>();

  /** Add an issue to the queue if not already present */
  enqueue(issue: JiraIssue): boolean {
    if (this.seen.has(issue.key)) return false;
    this.seen.add(issue.key);
    this.queue.push(issue);
    return true;
  }

  /** Remove and return the next issue */
  dequeue(): JiraIssue | undefined {
    const issue = this.queue.shift();
    return issue;
  }

  /** Peek at the next issue without removing it */
  peek(): JiraIssue | undefined {
    return this.queue[0];
  }

  /** Current queue size */
  get size(): number {
    return this.queue.length;
  }

  /** Get a read-only snapshot of queued items */
  get items(): readonly JiraIssueRef[] {
    return this.queue.map((i) => ({
      key: i.key,
      summary: i.fields.summary,
    }));
  }

  /** Mark a key as processed so it won't be re-enqueued by future polls */
  markProcessed(key: string): void {
    this.seen.add(key);
  }

  /** Clear the seen set (useful for restarting) */
  resetSeen(): void {
    this.seen.clear();
  }
}
