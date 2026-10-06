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
  /** Absolute path inside the sidecar container where the custom server is mounted. Only for `type: "custom"`. */
  containerPath?: string;
  /** Fixed port the server listens on inside the MCP sidecar container. */
  sidecarPort: number;
  /** Env vars that must be present for the server to work. */
  requiredEnv?: string[];
  /** Optional env vars the server supports. */
  optionalEnv?: string[];
  /**
   * Enforced tool allowlist: the only tools of this server an agent can list or call. The sidecar's
   * tool-filter proxy enforces it for every CLI; Copilot also receives it as `tools` in `mcp-config.json`.
   * Absent or empty means every tool the server exposes. Read it through {@link resolveToolAllowlist}.
   */
  tools?: string[];
  /** Env var names that MUST be provided by profiles using this server (via mcpServers object entries). */
  requiredConfig?: string[];
  /** Relative path to a shell script inside the server directory, executed at sidecar startup before the gateway launches. */
  initScript?: string;
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
      `MCP server manifest not found: ${manifestPath}\n` + `  Create shared/mcp-servers/${serverName}/mcp-server.json`,
    );
  }

  const raw = JSON.parse(readFileSync(manifestPath, "utf-8")) as McpServerManifest;
  if (!raw.name || !raw.command) {
    throw new Error(`Invalid MCP server manifest at ${manifestPath}: name and command are required`);
  }
  if (
    typeof raw.sidecarPort !== "number" ||
    !Number.isInteger(raw.sidecarPort) ||
    raw.sidecarPort < 1 ||
    raw.sidecarPort > 65535
  ) {
    throw new Error(
      `Invalid MCP server manifest at ${manifestPath}: sidecarPort must be an integer between 1 and 65535`,
    );
  }

  if (raw.requiredConfig !== undefined) {
    if (
      !Array.isArray(raw.requiredConfig) ||
      raw.requiredConfig.length === 0 ||
      raw.requiredConfig.some((v: unknown) => typeof v !== "string" || v === "")
    ) {
      throw new Error(
        `Invalid MCP server manifest at ${manifestPath}: requiredConfig must be a non-empty array of non-empty strings`,
      );
    }
  }

  if (raw.tools !== undefined) {
    if (!Array.isArray(raw.tools) || raw.tools.some((t: unknown) => typeof t !== "string" || t === "")) {
      throw new Error(`Invalid MCP server manifest at ${manifestPath}: tools must be an array of non-empty strings`);
    }
    if (new Set(raw.tools).size !== raw.tools.length) {
      throw new Error(`Invalid MCP server manifest at ${manifestPath}: tools must not contain duplicates`);
    }
  }

  if (raw.initScript !== undefined) {
    if (typeof raw.initScript !== "string" || raw.initScript === "") {
      throw new Error(`Invalid MCP server manifest at ${manifestPath}: initScript must be a non-empty string`);
    }
    if (raw.initScript.includes("..") || raw.initScript.startsWith("/")) {
      throw new Error(
        `Invalid MCP server manifest at ${manifestPath}: initScript must be a relative path within the server directory`,
      );
    }
    const initPath = join(mcpServersDir, serverName, raw.initScript);
    if (!existsSync(initPath)) {
      throw new Error(`MCP server init script not found: ${initPath}`);
    }
  }

  return raw;
}

/**
 * The tool allowlist a server's manifest declares.
 *
 * @returns The allowlisted tool names, or `undefined` when every tool is allowed (`tools` absent or empty).
 */
export function resolveToolAllowlist(manifest: McpServerManifest): string[] | undefined {
  return manifest.tools && manifest.tools.length > 0 ? manifest.tools : undefined;
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
