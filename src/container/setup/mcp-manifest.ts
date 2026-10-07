import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

/** MCP server types: "npm" for stdio packages installed in the sidecar image, "custom" for locally built servers. */
export enum McpServerType {
  Npm = "npm",
  Custom = "custom",
}

/** Port of the sidecar gateway's health endpoint, which no MCP server may use (the sidecar's `HEALTH_PORT`). */
export const MCP_GATEWAY_HEALTH_PORT = 9000;

/**
 * Distance between a filtered custom server's `sidecarPort` and the loopback port the sidecar runs it on
 * behind its tool-filter proxy (the sidecar's `UPSTREAM_PORT_OFFSET`).
 */
export const MCP_UPSTREAM_PORT_OFFSET = 10000;

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
   * Required for npm servers. Absent on a custom server means every tool it exposes.
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
 * @throws If the manifest file doesn't exist or is malformed, including a `tools` list that is
 *   empty, repeats a name or is missing on an npm server.
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
    if (
      !Array.isArray(raw.tools) ||
      raw.tools.length === 0 ||
      raw.tools.some((t: unknown) => typeof t !== "string" || t === "")
    ) {
      throw new Error(
        `Invalid MCP server manifest at ${manifestPath}: tools must be a non-empty array of non-empty strings`,
      );
    }
    if (new Set(raw.tools).size !== raw.tools.length) {
      throw new Error(`Invalid MCP server manifest at ${manifestPath}: tools must not contain duplicates`);
    }
  } else if (raw.type === McpServerType.Npm) {
    throw new Error(
      `Invalid MCP server manifest at ${manifestPath}: an npm server must list its tools, because the sidecar serves it only through its tool-filter proxy`,
    );
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
 * The loopback port the sidecar runs a server on behind its tool-filter proxy.
 *
 * @returns `sidecarPort + MCP_UPSTREAM_PORT_OFFSET` for a custom server with a `tools` allowlist;
 *   `undefined` for an unfiltered server (it listens on `sidecarPort`) and for an npm server (the
 *   sidecar reaches it over stdio).
 */
export function upstreamPortOf(manifest: McpServerManifest): number | undefined {
  return manifest.type === McpServerType.Custom && manifest.tools !== undefined
    ? manifest.sidecarPort + MCP_UPSTREAM_PORT_OFFSET
    : undefined;
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
