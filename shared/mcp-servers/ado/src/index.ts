#!/usr/bin/env node

/**
 * Azure DevOps MCP Server
 *
 * Provides tools for interacting with Azure DevOps pull requests:
 * - ado_create_pull_request: Create a new PR
 * - ado_list_pull_requests: List PRs in a repository
 * - ado_list_pull_request_threads: List comment threads on a PR
 * - ado_create_pull_request_thread: Create a comment thread on a PR
 * - ado_reply_to_comment: Reply to an existing thread on a PR
 *
 * Communicates via stdio using the MCP protocol. Designed to run inside
 * a container with HTTP proxy access to dev.azure.com.
 *
 * Required env vars:
 *   ADO_PAT — Personal Access Token for Azure DevOps
 */

import { NodeStreamableHTTPServerTransport } from "@modelcontextprotocol/node";
import { McpServer } from "@modelcontextprotocol/server";
import { StdioServerTransport } from "@modelcontextprotocol/server/stdio";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import type { ToolDefinition } from "./shared.js";
import { tool as createPullRequest } from "./tools/create-pull-request.js";
import { tool as createPullRequestThread } from "./tools/create-pull-request-thread.js";
import { tool as listPullRequestThreads } from "./tools/list-pull-request-threads.js";
import { tool as listPullRequests } from "./tools/list-pull-requests.js";
import { tool as replyToComment } from "./tools/reply-to-comment.js";
import { tool as pushProgress } from "./tools/push-progress.js";

const tools: ToolDefinition[] = [
  createPullRequest,
  listPullRequests,
  listPullRequestThreads,
  createPullRequestThread,
  replyToComment,
  pushProgress,
];

/** Create a fresh McpServer with all tools registered. */
function createMcpServer(): McpServer {
  const server = new McpServer({ name: "ado", version: "1.0.0" });
  for (const { name, config, handler } of tools) {
    server.registerTool(name, config, handler);
  }
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
    console.log(`ado MCP HTTP server listening on port ${port}`);
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
  console.error("ADO MCP server failed:", err);
  process.exit(1);
});
