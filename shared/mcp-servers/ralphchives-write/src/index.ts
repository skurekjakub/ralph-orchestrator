#!/usr/bin/env node

/**
 * Ralphchives Write Path MCP Server
 *
 * Provides tools for agents to post knowledge to the Ralphchives archive:
 * - post_task_report: Post a structured task report after completing a JIRA task
 * - post_observation: Post a standalone observation or insight
 *
 * Posts land in the NodeBB forum category assigned to the agent's profile
 * (resolved from NODEBB_CATEGORY_NAME at startup). Runs inside the MCP sidecar
 * which has direct internet access to the NodeBB instance.
 *
 * Required env vars:
 *   NODEBB_API_TOKEN       — Per-user bearer token for the NodeBB Write API
 *   NODEBB_CATEGORY_NAME   — Category name (e.g. "ralph-docs"), resolved to cid at startup
 *   NODEBB_API_URL         — NodeBB base URL (defaults to http://localhost:4567)
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { type ToolDefinition, initCategoryId } from "./shared.js";

// Resolve category name → cid before loading tools (they read NODEBB_CATEGORY_ID at import time)
await initCategoryId();

const { tool: postTaskReport } = await import("./tools/post-task-report.js");
const { tool: postObservation } = await import("./tools/post-observation.js");

const tools: ToolDefinition[] = [postTaskReport, postObservation];

/** Create a fresh McpServer with all tools registered. */
function createMcpServer(): McpServer {
  const server = new McpServer({ name: "ralphchives-write", version: "1.0.0" });
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
    const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });
    res.on("close", () => { transport.close(); mcpServer.close(); });
    await mcpServer.connect(transport);
    await transport.handleRequest(req, res, body);
  });

  httpServer.listen(port, "0.0.0.0", () => {
    console.log(`ralphchives-write MCP HTTP server listening on port ${port}`);
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
  console.error("ralphchives-write MCP server failed:", err);
  process.exit(1);
});
