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

import { NodeStreamableHTTPServerTransport } from "@modelcontextprotocol/node";
import { McpServer } from "@modelcontextprotocol/server";
import { StdioServerTransport } from "@modelcontextprotocol/server/stdio";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
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

/** Create a fresh McpServer with the discord_ask tool registered. */
function createMcpServer(): McpServer {
  const server = new McpServer({
    name: "discord-hitl",
    version: "1.0.0",
  });
  registerDiscordAsk(server, client, threadManager);
  return server;
}

/**
 * Stateless HTTP transport — each request gets a fresh McpServer + transport.
 * Eliminates session state so the server survives gateway-level restarts
 * without clients hitting "Server not initialized" errors.
 */
function startHttpTransport(port: number): void {
  const httpServer = createServer(async (req: IncomingMessage, res: ServerResponse) => {
    if (req.url === "/health") {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ status: "ok" }));
      return;
    }

    if (req.url !== "/mcp") {
      res.writeHead(404);
      res.end();
      return;
    }

    let body: unknown;
    if (req.method === "POST") {
      const chunks: Buffer[] = [];
      for await (const chunk of req) chunks.push(chunk as Buffer);
      try {
        body = JSON.parse(Buffer.concat(chunks).toString());
      } catch {
        res.writeHead(400, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "Invalid JSON" }));
        return;
      }
    }

    const mcpServer = createMcpServer();
    const transport = new NodeStreamableHTTPServerTransport({ sessionIdGenerator: undefined });
    res.on("close", () => {
      transport.close();
      mcpServer.close();
    });
    await mcpServer.connect(transport);
    await transport.handleRequest(req, res, body);
  });

  httpServer.listen(port, "0.0.0.0", () => {
    console.log(`discord-hitl MCP HTTP server listening on port ${port}`);
  });
}

async function main() {
  const transportIdx = process.argv.indexOf("--transport");
  const portIdx = process.argv.indexOf("--port");

  if (transportIdx !== -1 && process.argv[transportIdx + 1] === "http" && portIdx !== -1) {
    const port = parseInt(process.argv[portIdx + 1], 10);
    if (Number.isNaN(port) || port < 1 || port > 65535) {
      console.error(`Invalid --port value: ${process.argv[portIdx + 1]}`);
      process.exit(1);
    }
    startHttpTransport(port);
  } else {
    const server = createMcpServer();
    const transport = new StdioServerTransport();
    await server.connect(transport);
  }
}

main().catch((err) => {
  console.error("Discord HITL MCP server failed:", err);
  process.exit(1);
});
