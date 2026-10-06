import { join } from "node:path";
import { McpServerType, loadMcpManifest } from "./mcp-manifest.js";

/** MCP config entry for URL-based remote servers (Streamable HTTP). */
interface McpConfigUrlEntry {
  type: "http";
  url: string;
  /** When set, only these tools are exposed to the agent. Omit for all tools. */
  tools?: string[];
}

/** Sidecar hostname used inside Docker Compose internal network. */
const MCP_SIDECAR_HOST = "mcp-sidecar";

/**
 * Generate `mcp-config.json` content from a list of MCP server names.
 *
 * Produces URL-based entries pointing to the MCP sidecar container.
 * No secrets are included — the sidecar handles credentials internally.
 *
 * @param mcpServersDir Absolute path to `shared/mcp-servers/` on the host.
 * @param serverNames List of MCP server names to include.
 * @returns Serializable mcp-config.json content with URL entries.
 */
export function generateMcpConfig(
  mcpServersDir: string,
  serverNames: string[],
): { mcpServers: Record<string, McpConfigUrlEntry> } {
  const servers: Record<string, McpConfigUrlEntry> = {};

  for (const name of serverNames) {
    const manifest = loadMcpManifest(mcpServersDir, name);

    servers[name] = {
      type: "http",
      url: `http://${MCP_SIDECAR_HOST}:${manifest.sidecarPort}/mcp`,
    };

    if (manifest.tools && manifest.tools.length > 0) {
      servers[name].tools = manifest.tools;
    }
  }

  return { mcpServers: servers };
}

// ---------------------------------------------------------------------------
// Gateway config (for the MCP sidecar container)
// ---------------------------------------------------------------------------

/** A single server entry in the sidecar gateway config. */
export interface GatewayServerEntry {
  name: string;
  type: McpServerType;
  port: number;
  command: string;
  args: string[];
  env: Record<string, string>;
}

/** Full gateway config written to `.build/gateway.json`. */
export interface GatewayConfig {
  servers: GatewayServerEntry[];
}

/**
 * Generate `gateway.json` for the MCP sidecar's gateway process.
 *
 * Contains the actual commands, args, and embedded secrets for each server.
 * This file is mounted into the sidecar container only — never into the agent.
 * Generated per-profile so the sidecar only starts the servers that profile needs.
 *
 * @param mcpServersDir Absolute path to `shared/mcp-servers/` on the host.
 * @param serverNames MCP server names declared by this profile.
 * @param secrets Map of env var names to their resolved values.
 * @returns Serializable gateway config.
 */
export function generateGatewayConfig(
  mcpServersDir: string,
  serverNames: string[],
  secrets: Record<string, string | undefined> = {},
): GatewayConfig {
  const servers: GatewayServerEntry[] = [];

  for (const name of serverNames) {
    const manifest = loadMcpManifest(mcpServersDir, name);

    let command: string;
    let args: string[];

    if (manifest.type === McpServerType.Custom && manifest.containerPath) {
      command = manifest.command;
      args = manifest.args.map((a) => join(manifest.containerPath!, a));
    } else {
      command = manifest.command;
      args = manifest.args;
    }

    // Resolve secrets for this server
    const env: Record<string, string> = {};
    const envVars = [...(manifest.requiredEnv ?? []), ...(manifest.optionalEnv ?? [])];
    for (const v of envVars) {
      const value = secrets[v];
      if (value !== undefined) {
        env[v] = value;
      }
    }

    servers.push({
      name,
      type: manifest.type,
      port: manifest.sidecarPort,
      command,
      args,
      env,
    });
  }

  return { servers };
}
