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
 * Serves stateless Streamable HTTP when started with `--transport http --port <port>
 * [--host <address>]`, which is how the sidecar gateway runs it, and stdio otherwise.
 */

import { NodeStreamableHTTPServerTransport } from "@modelcontextprotocol/node";
import { McpServer } from "@modelcontextprotocol/server";
import { StdioServerTransport } from "@modelcontextprotocol/server/stdio";
import { LaunchTransport, parseLaunchArgs, serveStatelessHttp } from "../../common/http-launch";
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
      inputSchema: z.object({
        url: z.string().url().describe("URL to fetch"),
        maxLength: z
          .number()
          .int()
          .min(1)
          .max(500_000)
          .optional()
          .describe(`Maximum characters to return (default: ${DEFAULT_MAX_LENGTH})`),
      }),
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

async function main(): Promise<void> {
  const launch = parseLaunchArgs(process.argv.slice(2));
  if (launch.transport === LaunchTransport.Stdio) {
    await createMcpServer().connect(new StdioServerTransport());
    return;
  }
  await serveStatelessHttp(launch, "web-fetch", {
    createServer: createMcpServer,
    createTransport: () => new NodeStreamableHTTPServerTransport({ sessionIdGenerator: undefined }),
  });
}

main().catch((err) => {
  console.error("web-fetch MCP server failed:", err);
  process.exit(1);
});
