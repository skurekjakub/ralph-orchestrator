import type { DiscordClient } from "./discord-client";

/**
 * Manages a per-session Discord thread.
 *
 * On first use, creates a thread in the configured channel named
 * `[CONTEXT] Agent HITL`. Subsequent calls reuse the same thread.
 */
export class ThreadManager {
  private threadId: string | null = null;

  constructor(
    private readonly client: DiscordClient,
    private readonly context: string,
  ) {}

  /** Get or create the thread for this session. */
  async getThreadId(): Promise<string> {
    if (this.threadId) return this.threadId;

    const name = `[${this.context}] Agent HITL`;
    const thread = await this.client.createThread(name);
    this.threadId = thread.id;
    return thread.id;
  }
}
