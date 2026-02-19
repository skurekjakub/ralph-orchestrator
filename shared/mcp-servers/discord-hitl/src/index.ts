#!/usr/bin/env node

/**
 * Discord HITL MCP Server
 *
 * Provides a blocking question tool for human-in-the-loop interaction via Discord:
 * - discord_ask: Post a question and block until a human replies
 *
 * Communicates via stdio using the MCP protocol. Designed to run inside
 * a container with HTTP proxy access to discord.com.
 *
 * Required env vars:
 *   DISCORD_BOT_TOKEN    — Discord bot token
 *   DISCORD_CHANNEL_ID   — Channel to create threads in
 *
 * Optional env vars:
 *   DISCORD_TASK_CONTEXT  — Context label for thread names (e.g. JIRA key)
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { DiscordClient } from "./discord-client.js";
import { ThreadManager } from "./thread-manager.js";
import { registerDiscordAsk } from "./tools/discord-ask.js";

const DISCORD_BOT_TOKEN = process.env.DISCORD_BOT_TOKEN;
const DISCORD_CHANNEL_ID = process.env.DISCORD_CHANNEL_ID;
const DISCORD_TASK_CONTEXT = process.env.DISCORD_TASK_CONTEXT || "Agent";

if (!DISCORD_BOT_TOKEN || !DISCORD_CHANNEL_ID) {
  console.error("DISCORD_BOT_TOKEN and DISCORD_CHANNEL_ID must be set");
  process.exit(1);
}

const client = new DiscordClient(DISCORD_BOT_TOKEN, DISCORD_CHANNEL_ID);
const threadManager = new ThreadManager(client, DISCORD_TASK_CONTEXT);

const server = new McpServer({
  name: "discord-hitl",
  version: "1.0.0",
});

registerDiscordAsk(server, client, threadManager);

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((err) => {
  console.error("Discord HITL MCP server failed:", err);
  process.exit(1);
});
