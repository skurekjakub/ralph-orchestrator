import { join } from "node:path";
import { McpServerType, loadMcpManifest } from "./mcp-manifest.js";

/** MCP config entry for a single server (used by both Copilot and Claude Code CLIs). */
interface McpConfigEntry {
  command: string;
  args: string[];
  env?: Record<string, string>;
  /** When set, only these tools are exposed to the agent. Omit for all tools (`["*"]` default). */
  tools?: string[];
}

/**
 * Generate `mcp-config.json` content from a list of MCP server names.
 *
 * Resolves each server's manifest and builds the config entry. Custom servers
 * use their `containerPath` to build the full command path.
 *
 * Secret values are embedded directly from `secrets` instead of `${VAR}` references,
 * so MCP-specific credentials are never exposed as container env vars.
 *
 * @param mcpServersDir Absolute path to `shared/mcp-servers/` on the host.
 * @param serverNames List of MCP server names to include.
 * @param secrets Map of env var names to their resolved values (typically `process.env`).
 * @returns Serializable mcp-config.json content.
 */
export function generateMcpConfig(
  mcpServersDir: string,
  serverNames: string[],
  secrets: Record<string, string | undefined> = {},
): { mcpServers: Record<string, McpConfigEntry> } {
  const servers: Record<string, McpConfigEntry> = {};

  for (const name of serverNames) {
    const manifest = loadMcpManifest(mcpServersDir, name);

    if (manifest.type === McpServerType.Custom && manifest.containerPath) {
      servers[name] = {
        command: manifest.command,
        args: manifest.args.map((a) => join(manifest.containerPath!, a)),
      };
    } else {
      servers[name] = {
        command: manifest.command,
        args: manifest.args,
      };
    }

    // When the manifest declares a tool allowlist, pass it through so the CLI
    // only exposes those tools — even if the server advertises more.
    if (manifest.tools && manifest.tools.length > 0) {
      servers[name].tools = manifest.tools;
    }

    // Embed resolved secret values directly so they never appear as container
    // env vars. The agent CLI process won't have these in its environment.
    const envVars = [
      ...(manifest.requiredEnv ?? []),
      ...(manifest.optionalEnv ?? []),
    ];
    if (envVars.length > 0) {
      const env: Record<string, string> = {};
      for (const v of envVars) {
        const value = secrets[v];
        if (value !== undefined) {
          env[v] = value;
        }
      }
      if (Object.keys(env).length > 0) {
        servers[name].env = env;
      }
    }
  }

  return { mcpServers: servers };
}
