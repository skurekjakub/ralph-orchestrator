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
 * Serves stateless Streamable HTTP when started with `--transport http --port <port>
 * [--host <address>]`, which is how the sidecar gateway runs it, and stdio otherwise.
 *
 * Required env vars:
 *   NODEBB_API_TOKEN       — Bearer token for the NodeBB API
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

async function main(): Promise<void> {
  const launch = parseLaunchArgs(process.argv.slice(2));
  if (launch.transport === LaunchTransport.Stdio) {
    await createMcpServer().connect(new StdioServerTransport());
    return;
  }
  await serveStatelessHttp(launch, "ralphchives-read", {
    createServer: createMcpServer,
    createTransport: () => new NodeStreamableHTTPServerTransport({ sessionIdGenerator: undefined }),
  });
}

main().catch((err) => {
  console.error("ralphchives-read MCP server failed:", err);
  process.exit(1);
});
