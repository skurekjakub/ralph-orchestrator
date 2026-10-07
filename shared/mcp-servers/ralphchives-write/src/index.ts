#!/usr/bin/env node

/**
 * Ralphchives Write Path MCP Server
 *
 * Provides tools for agents to post knowledge to the Ralphchives archive:
 * - post_task_report: Post a structured task report after completing a JIRA task
 * - post_observation: Post a standalone observation or insight
 * - reply_to_thread: Reply to an existing topic with follow-up information
 *
 * Posts land in the NodeBB forum category assigned to the agent's profile
 * (resolved from NODEBB_CATEGORY_NAME at startup). Runs inside the MCP sidecar
 * which has direct internet access to the NodeBB instance.
 *
 * Serves stateless Streamable HTTP when started with `--transport http --port <port>
 * [--host <address>]`, which is how the sidecar gateway runs it, and stdio otherwise.
 *
 * Required env vars:
 *   NODEBB_API_TOKEN       — Per-user bearer token for the NodeBB Write API
 *   NODEBB_CATEGORY_NAME   — Category name (e.g. "ralph-docs"), resolved to cid at startup
 *   NODEBB_API_URL         — NodeBB base URL (defaults to http://localhost:4567)
 */

import { NodeStreamableHTTPServerTransport } from "@modelcontextprotocol/node";
import { McpServer } from "@modelcontextprotocol/server";
import { StdioServerTransport } from "@modelcontextprotocol/server/stdio";
import { LaunchTransport, parseLaunchArgs, serveStatelessHttp } from "../../common/http-launch";
import { type ToolDefinition, initCategoryId } from "./shared";

// Resolve category name → cid before loading tools (they read NODEBB_CATEGORY_ID at import time)
await initCategoryId();

const { tool: postTaskReport } = await import("./tools/post-task-report");
const { tool: postObservation } = await import("./tools/post-observation");
const { tool: replyToThread } = await import("./tools/reply-to-thread");

const tools: ToolDefinition[] = [postTaskReport, postObservation, replyToThread];

/** Create a fresh McpServer with all tools registered. */
function createMcpServer(): McpServer {
  const server = new McpServer({ name: "ralphchives-write", version: "1.0.0" });
  for (const { name, config, handler } of tools) {
    server.registerTool(name, config, handler);
  }
  return server;
}

async function main(): Promise<void> {
  const launch = parseLaunchArgs(process.argv.slice(2));
  if (launch.transport === LaunchTransport.Stdio) {
    await createMcpServer().connect(new StdioServerTransport());
    return;
  }
  await serveStatelessHttp(launch, "ralphchives-write", {
    createServer: createMcpServer,
    createTransport: () => new NodeStreamableHTTPServerTransport({ sessionIdGenerator: undefined }),
  });
}

main().catch((err) => {
  console.error("ralphchives-write MCP server failed:", err);
  process.exit(1);
});
