#!/usr/bin/env node

/**
 * Web Fetch MCP Server
 *
 * Provides a single tool for fetching content from arbitrary URLs:
 * - web_fetch: Retrieve the text content of any HTTP/HTTPS URL
 *
 * Runs inside the MCP sidecar which has unrestricted direct internet access
 * (not routed through Squid). Uses native Node.js fetch — no proxy required.
 *
 * Communicates via stdio using the MCP protocol, or via Streamable HTTP when
 * invoked with `--transport http --port <port>` by the gateway.
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import TurndownService from "turndown";
import { z } from "zod";

const DEFAULT_MAX_LENGTH = 50_000;

const turndown = new TurndownService({ headingStyle: "atx", codeBlockStyle: "fenced" });
turndown.remove(["script", "style", "noscript", "iframe"]);

function isHtml(contentType: string | null): boolean {
  return !!contentType && contentType.includes("text/html");
}

/** Create a fresh McpServer with the web_fetch tool registered. */
function createMcpServer(): McpServer {
  const server = new McpServer({ name: "web-fetch", version: "1.0.0" });

  server.registerTool(
    "web_fetch",
    {
      description:
        "Fetch the content of a URL and return it as text. " +
        "The MCP sidecar has unrestricted internet access so any public URL is reachable.",
      inputSchema: {
        url: z.string().url().describe("URL to fetch"),
        maxLength: z
          .number()
          .int()
          .min(1)
          .max(500_000)
          .optional()
          .describe(`Maximum characters to return (default: ${DEFAULT_MAX_LENGTH})`),
      },
    },
    async ({ url, maxLength = DEFAULT_MAX_LENGTH }) => {
      let response: Response;
      try {
        response = await fetch(url);
      } catch (err) {
        return {
          content: [
            {
              type: "text" as const,
              text: `Network error fetching ${url}: ${err instanceof Error ? err.message : String(err)}`,
            },
          ],
          isError: true,
        };
      }

      if (!response.ok) {
        return {
          content: [
            {
              type: "text" as const,
              text: `HTTP ${response.status} ${response.statusText} — ${url}`,
            },
          ],
          isError: true,
        };
      }

      const raw = await response.text();
      const contentType = response.headers.get("content-type");
      const text = isHtml(contentType) ? turndown.turndown(raw) : raw;
      const truncated = text.length > maxLength;
      const content = truncated ? text.slice(0, maxLength) : text;
      const suffix = truncated ? `\n\n[Content truncated: returned ${maxLength} of ${text.length} characters]` : "";

      return {
        content: [{ type: "text" as const, text: content + suffix }],
      };
    },
  );

  return server;
}

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
    res.on("close", () => {
      transport.close();
      mcpServer.close();
    });
    await mcpServer.connect(transport);
    await transport.handleRequest(req, res, body);
  });

  httpServer.listen(port, "0.0.0.0", () => {
    console.log(`web-fetch MCP HTTP server listening on port ${port}`);
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
  console.error("web-fetch MCP server failed:", err);
  process.exit(1);
});
