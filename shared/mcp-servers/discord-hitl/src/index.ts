#!/usr/bin/env node

/**
 * Discord HITL MCP Server
 *
 * Provides a blocking question tool for human-in-the-loop interaction via Discord:
 * - discord_ask: Post a question and block until a human replies
 *
 * Runs in the MCP sidecar, which reaches discord.com directly.
 * Serves stateless Streamable HTTP when started with `--transport http --port <port>
 * [--host <address>]`, which is how the sidecar gateway runs it, and stdio otherwise.
 *
 * Required env vars:
 *   DISCORD_BOT_TOKEN    — Discord bot token
 *   DISCORD_CHANNEL_ID   — Channel to create threads in
 *
 * Optional env vars:
 *   DISCORD_TASK_CONTEXT  — Context label for thread names (e.g. JIRA key)
 */

import { NodeStreamableHTTPServerTransport } from "@modelcontextprotocol/node";
import { McpServer } from "@modelcontextprotocol/server";
import { StdioServerTransport } from "@modelcontextprotocol/server/stdio";
import { LaunchTransport, parseLaunchArgs, serveStatelessHttp } from "../../common/http-launch";
import { DiscordClient } from "./discord-client";
import { ThreadManager } from "./thread-manager";
import { registerDiscordAsk } from "./tools/discord-ask";

const DISCORD_BOT_TOKEN = process.env.DISCORD_BOT_TOKEN;
const DISCORD_CHANNEL_ID = process.env.DISCORD_CHANNEL_ID;
const DISCORD_TASK_CONTEXT = process.env.DISCORD_TASK_CONTEXT || "Agent";

if (!DISCORD_BOT_TOKEN || !DISCORD_CHANNEL_ID) {
  console.error("DISCORD_BOT_TOKEN and DISCORD_CHANNEL_ID must be set");
  process.exit(1);
}

const client = new DiscordClient(DISCORD_BOT_TOKEN, DISCORD_CHANNEL_ID);
const threadManager = new ThreadManager(client, DISCORD_TASK_CONTEXT);

/** Create a fresh McpServer with the discord_ask tool registered. */
function createMcpServer(): McpServer {
  const server = new McpServer({
    name: "discord-hitl",
    version: "1.0.0",
  });
  registerDiscordAsk(server, client, threadManager);
  return server;
}

async function main(): Promise<void> {
  const launch = parseLaunchArgs(process.argv.slice(2));
  if (launch.transport === LaunchTransport.Stdio) {
    await createMcpServer().connect(new StdioServerTransport());
    return;
  }
  await serveStatelessHttp(launch, "discord-hitl", {
    createServer: createMcpServer,
    createTransport: () => new NodeStreamableHTTPServerTransport({ sessionIdGenerator: undefined }),
  });
}

main().catch((err) => {
  console.error("Discord HITL MCP server failed:", err);
  process.exit(1);
});
