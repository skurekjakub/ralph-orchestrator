import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/server";
import type { DiscordClient } from "../discord-client.js";
import type { ThreadManager } from "../thread-manager.js";

const DEFAULT_TIMEOUT_MINUTES = 60;
const MAX_TIMEOUT_MINUTES = 1440; // 24h

const inputSchema = z.object({
  question: z.string().describe("The question to ask the human (supports markdown)"),
  context: z.string().optional().describe("Optional context header (e.g. 'Phase 2 Questions')"),
  timeout_minutes: z
    .number()
    .min(1)
    .max(MAX_TIMEOUT_MINUTES)
    .default(DEFAULT_TIMEOUT_MINUTES)
    .describe("How long to wait for a response in minutes (default: 60)"),
});

export function registerDiscordAsk(server: McpServer, client: DiscordClient, threadManager: ThreadManager): void {
  server.registerTool(
    "discord_ask",
    {
      description:
        "Post a question to Discord and wait for a human response. BLOCKS until a reply is received or timeout is reached. Use this when you need human input, clarification, or answers to proceed.",
      inputSchema,
    },
    async ({ question, context, timeout_minutes }) => {
      const threadId = await threadManager.getThreadId();

      let message = "";
      if (context) {
        message += `**${context}**\n\n`;
      }
      message += question;

      const posted = await client.postMessage(threadId, message);
      const timeoutMs = (timeout_minutes ?? DEFAULT_TIMEOUT_MINUTES) * 60 * 1000;

      const reply = await client.waitForReply(threadId, posted.id, timeoutMs);

      if (!reply) {
        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify({
                timeout: true,
                message: `No response received within ${timeout_minutes ?? DEFAULT_TIMEOUT_MINUTES} minutes. Proceeding with autonomous decision.`,
              }),
            },
          ],
        };
      }

      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify({
              response: reply.content,
              author: reply.author.username,
              timestamp: reply.timestamp,
            }),
          },
        ],
      };
    },
  );
}
