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
 * Serves stateless Streamable HTTP when started with `--transport http --port <port>
 * [--host <address>]`, which is how the sidecar gateway runs it, and stdio otherwise.
 */

import { NodeStreamableHTTPServerTransport } from "@modelcontextprotocol/node";
import { McpServer } from "@modelcontextprotocol/server";
import { StdioServerTransport } from "@modelcontextprotocol/server/stdio";
import { LaunchTransport, parseLaunchArgs, serveStatelessHttp } from "../../common/http-launch";
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

async function main(): Promise<void> {
  const launch = parseLaunchArgs(process.argv.slice(2));
  if (launch.transport === LaunchTransport.Stdio) {
    await createMcpServer().connect(new StdioServerTransport());
    return;
  }
  await serveStatelessHttp(launch, "microsoft-docs", {
    createServer: createMcpServer,
    createTransport: () => new NodeStreamableHTTPServerTransport({ sessionIdGenerator: undefined }),
  });
}

main().catch((err) => {
  console.error("microsoft-docs MCP server failed:", err);
  process.exit(1);
});
