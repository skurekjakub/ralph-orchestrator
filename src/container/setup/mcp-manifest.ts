import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

/** MCP server types: "npm" for npx-based, "custom" for locally-built servers. */
export enum McpServerType {
  Npm = "npm",
  Custom = "custom",
}

/** Schema for shared/mcp-servers/<name>/mcp-server.json manifests. */
export interface McpServerManifest {
  name: string;
  description: string;
  type: McpServerType;
  command: string;
  args: string[];
  /** Absolute path inside the container where the custom server is mounted. Only for `type: "custom"`. */
  containerPath?: string;
  /** Env vars that must be present for the server to work. */
  requiredEnv?: string[];
  /** Optional env vars the server supports. */
  optionalEnv?: string[];
  /** Domains the server needs egress access to (for squid allowlist reference). */
  proxyDomains?: string[];
  /** Domain → allowed URL path prefixes. Used by URL path restrictions and Copilot CLI URL config. */
  allowedUrlPaths?: Record<string, string[]>;
  /** Tool names this server provides (documentation / prompt-authoring reference). */
  tools?: string[];
}

/**
 * Load an MCP server manifest from `shared/mcp-servers/<name>/mcp-server.json`.
 *
 * @throws If the manifest file doesn't exist or is malformed.
 */
export function loadMcpManifest(mcpServersDir: string, serverName: string): McpServerManifest {
  const manifestPath = join(mcpServersDir, serverName, "mcp-server.json");
  if (!existsSync(manifestPath)) {
    throw new Error(
      `MCP server manifest not found: ${manifestPath}\n` +
      `  Create shared/mcp-servers/${serverName}/mcp-server.json`
    );
  }

  const raw = JSON.parse(readFileSync(manifestPath, "utf-8")) as McpServerManifest;
  if (!raw.name || !raw.command) {
    throw new Error(`Invalid MCP server manifest at ${manifestPath}: name and command are required`);
  }
  return raw;
}

/**
 * Discover all available MCP server names from the shared/mcp-servers/ directory.
 */
export function discoverMcpServers(mcpServersDir: string): string[] {
  if (!existsSync(mcpServersDir)) return [];
  return readdirSync(mcpServersDir, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .filter((d) => existsSync(join(mcpServersDir, d.name, "mcp-server.json")))
    .map((d) => d.name);
}
