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
 * Runs in the MCP sidecar, which has direct internet access.
 * Serves stateless Streamable HTTP when started with `--transport http --port <port>
 * [--host <address>]`, which is how the sidecar gateway runs it, and stdio otherwise.
 *
 * Required env vars:
 *   ADO_PAT — Personal Access Token for Azure DevOps
 */

import { NodeStreamableHTTPServerTransport } from "@modelcontextprotocol/node";
import { McpServer } from "@modelcontextprotocol/server";
import { StdioServerTransport } from "@modelcontextprotocol/server/stdio";
import { LaunchTransport, parseLaunchArgs, serveStatelessHttp } from "../../common/http-launch";
import type { ToolDefinition } from "./shared";
import { tool as createPullRequest } from "./tools/create-pull-request";
import { tool as createPullRequestThread } from "./tools/create-pull-request-thread";
import { tool as listPullRequestThreads } from "./tools/list-pull-request-threads";
import { tool as listPullRequests } from "./tools/list-pull-requests";
import { tool as replyToComment } from "./tools/reply-to-comment";
import { tool as pushProgress } from "./tools/push-progress";

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

async function main(): Promise<void> {
  const launch = parseLaunchArgs(process.argv.slice(2));
  if (launch.transport === LaunchTransport.Stdio) {
    await createMcpServer().connect(new StdioServerTransport());
    return;
  }
  await serveStatelessHttp(launch, "ado", {
    createServer: createMcpServer,
    createTransport: () => new NodeStreamableHTTPServerTransport({ sessionIdGenerator: undefined }),
  });
}

main().catch((err) => {
  console.error("ADO MCP server failed:", err);
  process.exit(1);
});
