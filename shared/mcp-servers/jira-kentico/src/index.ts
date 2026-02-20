#!/usr/bin/env node

/**
 * JIRA Cloud MCP Server
 *
 * Provides tools for interacting with JIRA issues:
 * - jira_add_comment: Add a comment to an issue (wiki markup)
 * - jira_add_attachment: Attach a file to an issue
 *
 * Communicates via stdio using the MCP protocol. Designed to run inside
 * a container with HTTP proxy access to atlassian.com.
 *
 * Required env vars:
 *   JIRA_PAT       — API token for authentication
 *   JIRA_EMAIL     — Email for Basic auth
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import axios from "axios";
import { HttpsProxyAgent } from "https-proxy-agent";
import { z } from "zod";
import { readFileSync } from "node:fs";

// Proxy agent for CONNECT tunneling through Squid (axios built-in proxy doesn't do CONNECT)
const proxyUrl = process.env.HTTPS_PROXY || process.env.https_proxy || process.env.HTTP_PROXY || process.env.http_proxy;
const httpsAgent = proxyUrl ? new HttpsProxyAgent(proxyUrl) : undefined;

const JIRA_PAT = process.env.JIRA_PAT;
const JIRA_EMAIL = process.env.JIRA_EMAIL;

if (!JIRA_PAT || !JIRA_EMAIL) {
  console.error("JIRA_PAT and JIRA_EMAIL must be set");
  process.exit(1);
}

const apiBase = "https://api.atlassian.com/ex/jira/37df0bb1-cba3-49a3-a001-61b91bdd8c08/rest/api/2";
const authHeader = `Basic ${Buffer.from(`${JIRA_EMAIL}:${JIRA_PAT}`).toString("base64")}`;

const server = new McpServer({
  name: "jira-kentico",
  version: "1.0.0",
});

// ---------------------------------------------------------------------------
// jira_add_comment
// ---------------------------------------------------------------------------

server.registerTool("jira_add_comment", {
  description:
    "Add a comment to a JIRA issue. The comment body uses JIRA wiki markup " +
    "(h3. for headings, {{code}} for inline code, {code:lang}...{code} for blocks, " +
    "bq. for blockquotes, regular markdown for the rest). Use \\n for newlines.",
  inputSchema: {
    issueKey: z.string().describe("JIRA issue key (e.g. DOC-3143)"),
    body: z.string().describe("Comment body in JIRA wiki markup"),
  },
}, async ({ issueKey, body }) => {
  const url = `${apiBase}/issue/${encodeURIComponent(issueKey)}/comment`;

  try {
    const res = await axios.post(url, { body }, {
      headers: {
        "Content-Type": "application/json",
        Authorization: authHeader,
      },
      httpsAgent,
      proxy: false,
    });

    return {
      content: [{ type: "text" as const, text: JSON.stringify({ success: true, commentId: res.data.id, issueKey }) }],
    };
  } catch (err: unknown) {
    const status = axios.isAxiosError(err) ? err.response?.status ?? 0 : 0;
    const message = axios.isAxiosError(err) ? err.response?.data ?? err.message : String(err);
    return {
      content: [{ type: "text" as const, text: JSON.stringify({ error: true, status, message }) }],
      isError: true,
    };
  }
});

// ---------------------------------------------------------------------------
// jira_add_attachment
// ---------------------------------------------------------------------------

server.registerTool("jira_add_attachment", {
  description:
    "Attach a file to a JIRA issue. Provide the absolute path to the file inside the container.",
  inputSchema: {
    issueKey: z.string().describe("JIRA issue key (e.g. DOC-3143)"),
    filePath: z.string().describe("Absolute path to the file to attach"),
  },
}, async ({ issueKey, filePath }) => {
  const url = `${apiBase}/issue/${encodeURIComponent(issueKey)}/attachments`;

  const fileContent = readFileSync(filePath);
  const fileName = filePath.split("/").pop() ?? "attachment";

  const formData = new FormData();
  formData.append("file", new Blob([fileContent]), fileName);

  try {
    const res = await axios.post(url, formData, {
      headers: {
        Authorization: authHeader,
        "X-Atlassian-Token": "no-check",
      },
      httpsAgent,
      proxy: false,
    });

    const data = res.data as Array<{ id: string; filename: string }>;
    return {
      content: [{ type: "text" as const, text: JSON.stringify({ success: true, attachments: data.map((a) => ({ id: a.id, filename: a.filename })) }) }],
    };
  } catch (err: unknown) {
    const status = axios.isAxiosError(err) ? err.response?.status ?? 0 : 0;
    const message = axios.isAxiosError(err) ? err.response?.data ?? err.message : String(err);
    return {
      content: [{ type: "text" as const, text: JSON.stringify({ error: true, status, message }) }],
      isError: true,
    };
  }
});

// ---------------------------------------------------------------------------
// Start
// ---------------------------------------------------------------------------

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((err) => {
  console.error("JIRA MCP server failed:", err);
  process.exit(1);
});
