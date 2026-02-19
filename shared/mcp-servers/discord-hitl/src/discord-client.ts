/**
 * Minimal Discord REST API client — uses native fetch, no WebSocket gateway.
 *
 * Designed to work through an HTTP proxy (Squid) since the agent container
 * has no direct internet access. Only uses REST endpoints for posting messages
 * and polling for replies.
 */

const API_BASE = "https://discord.com/api/v10";

interface DiscordMessage {
  id: string;
  content: string;
  author: {
    id: string;
    username: string;
    bot?: boolean;
  };
  timestamp: string;
}

interface DiscordThread {
  id: string;
  name: string;
}

export class DiscordClient {
  private readonly token: string;
  private readonly channelId: string;
  private botUserId: string | null = null;

  constructor(token: string, channelId: string) {
    this.token = token;
    this.channelId = channelId;
  }

  private headers(): Record<string, string> {
    return {
      "Authorization": `Bot ${this.token}`,
      "Content-Type": "application/json",
    };
  }

  private async request<T>(path: string, options?: RequestInit): Promise<T> {
    const url = `${API_BASE}${path}`;
    const response = await fetch(url, {
      ...options,
      headers: { ...this.headers(), ...options?.headers },
    });

    if (!response.ok) {
      const body = await response.text().catch(() => "");
      throw new Error(`Discord API error ${response.status}: ${body}`);
    }

    return response.json() as Promise<T>;
  }

  /** Fetch the bot's own user ID (cached after first call). */
  private async getBotUserId(): Promise<string> {
    if (this.botUserId) return this.botUserId;
    const me = await this.request<{ id: string }>("/users/@me");
    this.botUserId = me.id;
    return me.id;
  }

  /** Create a thread in the configured channel. */
  async createThread(name: string): Promise<DiscordThread> {
    return this.request<DiscordThread>(
      `/channels/${this.channelId}/threads`,
      {
        method: "POST",
        body: JSON.stringify({
          name: name.slice(0, 100),
          type: 11, // PUBLIC_THREAD
          auto_archive_duration: 1440, // 24h
        }),
      },
    );
  }

  /** Post a message to a channel or thread. */
  async postMessage(channelId: string, content: string): Promise<DiscordMessage> {
    return this.request<DiscordMessage>(
      `/channels/${channelId}/messages`,
      {
        method: "POST",
        body: JSON.stringify({ content: content.slice(0, 2000) }),
      },
    );
  }

  /**
   * Poll for a human reply in a channel/thread.
   *
   * Returns the first message after `afterMessageId` from a non-bot user.
   * Polls every `intervalMs` until a reply arrives or `timeoutMs` is reached.
   */
  async waitForReply(
    channelId: string,
    afterMessageId: string,
    timeoutMs: number,
    intervalMs = 5000,
  ): Promise<DiscordMessage | null> {
    const botId = await this.getBotUserId();
    const deadline = Date.now() + timeoutMs;

    while (Date.now() < deadline) {
      const messages = await this.request<DiscordMessage[]>(
        `/channels/${channelId}/messages?after=${afterMessageId}&limit=10`,
      );

      const humanReply = messages.find((m) => m.author.id !== botId && !m.author.bot);
      if (humanReply) return humanReply;

      const remaining = deadline - Date.now();
      if (remaining <= 0) break;
      await new Promise((r) => setTimeout(r, Math.min(intervalMs, remaining)));
    }

    return null;
  }

  /**
   * Poll for an approval reaction or reply.
   *
   * Looks for replies containing "approve"/"approved"/"yes"/"lgtm" (approved)
   * or "reject"/"rejected"/"no"/"change" (rejected).
   */
  async waitForApproval(
    channelId: string,
    afterMessageId: string,
    timeoutMs: number,
    intervalMs = 5000,
  ): Promise<{ approved: boolean; feedback: string | null } | null> {
    const reply = await this.waitForReply(channelId, afterMessageId, timeoutMs, intervalMs);
    if (!reply) return null;

    const lower = reply.content.toLowerCase().trim();
    const approvePatterns = ["approve", "approved", "yes", "lgtm", "👍", "✅"];
    const rejectPatterns = ["reject", "rejected", "no", "change", "👎", "❌"];

    const isApproved = approvePatterns.some((p) => lower.includes(p));
    const isRejected = rejectPatterns.some((p) => lower.includes(p));

    if (isApproved && !isRejected) {
      return { approved: true, feedback: null };
    }

    // Default to rejected with feedback if ambiguous or explicitly rejected
    return {
      approved: false,
      feedback: reply.content,
    };
  }
}
