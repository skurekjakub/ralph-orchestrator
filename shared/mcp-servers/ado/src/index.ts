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

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import type { ToolDefinition } from "./shared.js";
import { tool as createPullRequest } from "./tools/create-pull-request.js";
import { tool as createPullRequestThread } from "./tools/create-pull-request-thread.js";
import { tool as listPullRequestThreads } from "./tools/list-pull-request-threads.js";
import { tool as listPullRequests } from "./tools/list-pull-requests.js";
import { tool as replyToComment } from "./tools/reply-to-comment.js";

const tools: ToolDefinition[] = [
  createPullRequest,
  listPullRequests,
  listPullRequestThreads,
  createPullRequestThread,
  replyToComment,
];

const server = new McpServer({
  name: "ado",
  version: "1.0.0",
});

for (const { name, config, handler } of tools) {
  server.registerTool(name, config, handler);
}

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((err) => {
  console.error("ADO MCP server failed:", err);
  process.exit(1);
});
