#!/usr/bin/env node

/**
 * JIRA Cloud MCP Server
 *
 * Provides tools for interacting with JIRA issues:
 * - jira_add_comment: Add a comment to an issue (wiki markup)
 * - jira_add_attachment: Attach a file to an issue
 *
 * Communicates via stdio using the MCP protocol. Designed to run inside
 * the MCP sidecar container, which has unrestricted direct internet access.
 *
 * Required env vars:
 *   JIRA_PAT       — API token for authentication
 *   JIRA_EMAIL     — Email for Basic auth
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import axios from "axios";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { z } from "zod";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

/**
 * Shared directory between agent and sidecar containers for file exchange.
 * The agent writes files here, the sidecar reads them for attachment upload.
 */
const ATTACHMENTS_DIR = "/tmp/mcp-attachments";

const JIRA_PAT = process.env.JIRA_PAT_KENTICO_JIRA;
const JIRA_EMAIL = process.env.JIRA_EMAIL_KENTICO_JIRA;

if (!JIRA_PAT || !JIRA_EMAIL) {
  console.error("JIRA_PAT and JIRA_EMAIL must be set");
  process.exit(1);
}

/** Task-scoped issue key injected by the orchestrator's JIT MCP param system. */
const JIRA_ISSUE_KEY = process.env.JIRA_ISSUE_KEY;

const apiBase = "https://api.atlassian.com/ex/jira/37df0bb1-cba3-49a3-a001-61b91bdd8c08/rest/api/2";
const authHeader = `Basic ${Buffer.from(`${JIRA_EMAIL}:${JIRA_PAT}`).toString("base64")}`;

/**
 * Sanitize JIRA wiki markup from LLM agents.
 *
 * Agents frequently produce literal `\n` (two-char backslash-n) instead of actual
 * newlines in JSON string values. JIRA's wiki renderer needs real newlines to
 * create line breaks, so the entire comment renders as a single blob without them.
 */
function sanitizeWikiMarkup(raw: string): string {
  // Replace literal \n sequences with real newlines.
  // Must be done before any other processing since it changes the line structure.
  return raw.replace(/\\n/g, "\n");
}

/** Create a fresh McpServer with all JIRA tools registered. */
function createMcpServer(): McpServer {
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
      "bq. for blockquotes, regular markdown for the rest). " +
      "Use real newlines to separate lines — do NOT use literal backslash-n escape sequences." +
      (JIRA_ISSUE_KEY ? ` The issue key is pre-configured to ${JIRA_ISSUE_KEY}.` : ""),
    inputSchema: JIRA_ISSUE_KEY
      ? { body: z.string().describe("Comment body in JIRA wiki markup") }
      : {
          issueKey: z.string().describe("JIRA issue key (e.g. DOC-3143)"),
          body: z.string().describe("Comment body in JIRA wiki markup"),
        },
  }, async (args: Record<string, unknown>) => {
    const issueKey = JIRA_ISSUE_KEY ?? String(args.issueKey);
    const body = String(args.body);
    const url = `${apiBase}/issue/${encodeURIComponent(issueKey)}/comment`;
    const sanitized = sanitizeWikiMarkup(body);

    try {
      const res = await axios.post(url, { body: sanitized }, {
        headers: {
          "Content-Type": "application/json",
          Authorization: authHeader,
        },
      });

      return {
        content: [{ type: "text" as const, text: JSON.stringify({ success: true, commentId: res.data.id }) }],
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
      "Attach a file to a JIRA issue. The file must be placed in /tmp/mcp-attachments/" +
      (JIRA_ISSUE_KEY ? ` The issue key is pre-configured to ${JIRA_ISSUE_KEY}.` : ""),
    inputSchema: JIRA_ISSUE_KEY
      ? { fileName: z.string().describe("Name of the file in /tmp/mcp-attachments/ (e.g. handoff.md)") }
      : {
          issueKey: z.string().describe("JIRA issue key (e.g. DOC-3143)"),
          fileName: z.string().describe("Name of the file in /tmp/mcp-attachments/ (e.g. handoff.md)"),
        },
  }, async (args: Record<string, unknown>) => {
    const issueKey = JIRA_ISSUE_KEY ?? String(args.issueKey);
    const fileName = String(args.fileName);
    const url = `${apiBase}/issue/${encodeURIComponent(issueKey)}/attachments`;

    // Validate the resolved path stays within the attachments directory
    const resolvedPath = resolve(ATTACHMENTS_DIR, fileName);
    if (!resolvedPath.startsWith(ATTACHMENTS_DIR + "/")) {
      return {
        content: [{ type: "text" as const, text: JSON.stringify({ error: true, message: "File path must be within /tmp/mcp-attachments/" }) }],
        isError: true,
      };
    }

    let fileContent: Buffer;
    try {
      fileContent = readFileSync(resolvedPath);
    } catch {
      return {
        content: [{ type: "text" as const, text: JSON.stringify({ error: true, message: `File not found: ${fileName}. Copy the file to /tmp/mcp-attachments/ first.` }) }],
        isError: true,
      };
    }

    const formData = new FormData();
    formData.append("file", new Blob([new Uint8Array(fileContent)]), fileName);

    try {
      const res = await axios.post(url, formData, {
        headers: {
          Authorization: authHeader,
          "X-Atlassian-Token": "no-check",
        },
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

  return server;
}

// ---------------------------------------------------------------------------
// Start
// ---------------------------------------------------------------------------

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
    const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });
    res.on("close", () => { transport.close(); mcpServer.close(); });
    await mcpServer.connect(transport);
    await transport.handleRequest(req, res, body);
  });

  httpServer.listen(port, "0.0.0.0", () => {
    console.log(`jira-kentico MCP HTTP server listening on port ${port}`);
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
  console.error("JIRA MCP server failed:", err);
  process.exit(1);
});
