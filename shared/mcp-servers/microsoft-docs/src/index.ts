#!/usr/bin/env node

/**
 * Microsoft Docs MCP Server
 *
 * Provides a single tool for searching Microsoft Learn documentation:
 * - microsoft_docs_search: Search learn.microsoft.com via the public search API
 *
 * Uses the Microsoft Learn public search API (no API key required):
 * https://learn.microsoft.com/api/search?search=<query>&locale=en-us
 *
 * Runs inside the MCP sidecar which has unrestricted direct internet access.
 * After finding relevant pages, use the web_fetch tool to retrieve full content.
 *
 * Communicates via stdio using the MCP protocol, or via Streamable HTTP when
 * invoked with `--transport http --port <port>` by the gateway.
 */

import { NodeStreamableHTTPServerTransport } from "@modelcontextprotocol/node";
import { McpServer } from "@modelcontextprotocol/server";
import { StdioServerTransport } from "@modelcontextprotocol/server/stdio";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { z } from "zod";

const SEARCH_API_BASE = "https://learn.microsoft.com/api/search";

interface SearchResult {
  title: string;
  url: string;
  description: string;
  lastModified?: string;
}

interface SearchResponse {
  results: SearchResult[];
  count: number;
}

/** Create a fresh McpServer with the microsoft_docs_search tool registered. */
function createMcpServer(): McpServer {
  const server = new McpServer({ name: "microsoft-docs", version: "1.0.0" });

  server.registerTool(
    "microsoft_docs_search",
    {
      description:
        "Search Microsoft Learn documentation (learn.microsoft.com). " +
        "Returns titles, URLs, and descriptions. " +
        "Use the web_fetch tool to retrieve the full content of a result page.",
      inputSchema: z.object({
        query: z.string().min(1).describe("Search query"),
        locale: z.string().optional().describe("Locale for results (default: en-us)"),
        maxResults: z
          .number()
          .int()
          .min(1)
          .max(50)
          .optional()
          .describe("Maximum number of results to return (default: 10)"),
      }),
    },
    async ({ query, locale = "en-us", maxResults = 10 }) => {
      const params = new URLSearchParams({
        search: query,
        locale,
        $top: String(maxResults),
      });

      let data: SearchResponse;
      try {
        const response = await fetch(`${SEARCH_API_BASE}?${params}`);
        if (!response.ok) {
          return {
            content: [
              {
                type: "text" as const,
                text: `Microsoft Learn search API returned HTTP ${response.status} ${response.statusText}`,
              },
            ],
            isError: true,
          };
        }
        data = (await response.json()) as SearchResponse;
      } catch (err) {
        return {
          content: [
            {
              type: "text" as const,
              text: `Failed to search Microsoft Learn: ${err instanceof Error ? err.message : String(err)}`,
            },
          ],
          isError: true,
        };
      }

      if (!data.results || data.results.length === 0) {
        return {
          content: [{ type: "text" as const, text: `No results found for: ${query}` }],
        };
      }

      const lines: string[] = [
        `Found ${data.results.length} result${data.results.length === 1 ? "" : "s"} for: ${query}`,
        "",
      ];

      for (const result of data.results) {
        lines.push(`**${result.title}**`);
        lines.push(`URL: ${result.url}`);
        if (result.description) {
          lines.push(result.description);
        }
        if (result.lastModified) {
          lines.push(`Last modified: ${result.lastModified}`);
        }
        lines.push("");
      }

      return {
        content: [{ type: "text" as const, text: lines.join("\n").trimEnd() }],
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
    const transport = new NodeStreamableHTTPServerTransport({ sessionIdGenerator: undefined });
    res.on("close", () => {
      transport.close();
      mcpServer.close();
    });
    await mcpServer.connect(transport);
    await transport.handleRequest(req, res, body);
  });

  httpServer.listen(port, "0.0.0.0", () => {
    console.log(`microsoft-docs MCP HTTP server listening on port ${port}`);
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
  console.error("microsoft-docs MCP server failed:", err);
  process.exit(1);
});
