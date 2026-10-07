#!/usr/bin/env node

/**
 * Ralphchives Read Path MCP Server
 *
 * Provides tools for agents to search and retrieve knowledge from Ralphchives:
 * - search_ralphchives: Fuzzy search across topics and posts, scoped to profile category
 * - get_topic: Retrieve full topic with all posts/replies
 * - list_recent_topics: Browse recent activity in the profile's category
 *
 * All reads are scoped to the agent's profile category (resolved from
 * NODEBB_CATEGORY_NAME at startup). Runs inside the MCP sidecar which has
 * direct internet access to NodeBB.
 *
 * Required env vars:
 *   NODEBB_API_TOKEN       — Bearer token for the NodeBB API
 *   NODEBB_CATEGORY_NAME   — Category name (e.g. "ralph-docs"), resolved to cid at startup
 *   NODEBB_API_URL         — NodeBB base URL (defaults to http://localhost:4567)
 */

import { NodeStreamableHTTPServerTransport } from "@modelcontextprotocol/node";
import { McpServer } from "@modelcontextprotocol/server";
import { StdioServerTransport } from "@modelcontextprotocol/server/stdio";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { type ToolDefinition, initCategoryId } from "./shared";

// Resolve category name → cid before loading tools (they read NODEBB_CATEGORY_ID at import time)
await initCategoryId();

const { tool: searchRalphchives } = await import("./tools/search-ralphchives");
const { tool: getTopic } = await import("./tools/get-topic");
const { tool: listRecentTopics } = await import("./tools/list-recent-topics");

const tools: ToolDefinition[] = [searchRalphchives, getTopic, listRecentTopics];

/** Create a fresh McpServer with all tools registered. */
function createMcpServer(): McpServer {
  const server = new McpServer({ name: "ralphchives-read", version: "1.0.0" });
  for (const { name, config, handler } of tools) {
    server.registerTool(name, config, handler);
  }
  return server;
}

/**
 * Stateless HTTP transport — each request gets a fresh McpServer + transport.
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
    console.log(`ralphchives-read MCP HTTP server listening on port ${port}`);
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
  console.error("ralphchives-read MCP server failed:", err);
  process.exit(1);
});
