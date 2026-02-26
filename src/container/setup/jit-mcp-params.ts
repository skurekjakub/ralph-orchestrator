import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { resolve, join } from "node:path";
import type { IAgentProfile } from "../../config/types.js";
import type { JiraIssue } from "../../jira/types.js";
import type { Logger } from "../../logger.js";
import type { GatewayConfig, GatewayServerEntry } from "./mcp-config.js";
import { slugifyBranchName } from "../../util/branch.js";

/** Known runtime macros resolved from the current JIRA issue context. */
const MACROS: Record<string, (workItem: JiraIssue) => string> = {
  "$jira.key": (workItem) => workItem.key,
  "$jira.project": (workItem) => workItem.key.split("-")[0],
  "$jira.branch": (workItem) => slugifyBranchName(workItem.key, workItem.fields.summary ?? ""),
  "$jira.summary": (workItem) => workItem.fields.summary ?? "",
};

const TRIGGER_PREFIX = "$trigger.";
const VARIANT_ENV_PREFIX = "$variantEnv.";

/**
 * Build a process.env variable name from a prefix, profile id, and variant display name.
 *
 * Example: `("NODEBB_TOKEN", "ralph-docs", "ralph")` → `"NODEBB_TOKEN_RALPH_DOCS_RALPH"`
 */
export function buildVariantEnvName(prefix: string, profileId: string, displayName: string): string {
  return `${prefix}_${profileId}_${displayName}`.toUpperCase().replace(/[-./]/g, "_");
}

/**
 * Resolve an env var value — either a static string, a `$macro` reference,
 * a `$trigger.<key>` reference resolved from JIRA comment trigger params,
 * or a `$variantEnv.PREFIX` reference resolved from process.env using a
 * variant-scoped env var name (`PREFIX_PROFILEID_DISPLAYNAME`).
 *
 * @throws If a `$`-prefixed value doesn't match any known macro or trigger prefix.
 */
function resolveEnvValue(
  value: string,
  workItem: JiraIssue,
  triggerParams?: Record<string, string>,
  profile?: IAgentProfile,
): string {
  if (!value.startsWith("$")) return value;

  if (value.startsWith(TRIGGER_PREFIX)) {
    const key = value.slice(TRIGGER_PREFIX.length);
    return triggerParams?.[key] ?? "";
  }

  if (value.startsWith(VARIANT_ENV_PREFIX)) {
    if (!profile) throw new Error(`$variantEnv macros require profile context`);
    const prefix = value.slice(VARIANT_ENV_PREFIX.length);
    const envVarName = buildVariantEnvName(prefix, profile.id, profile.displayName);
    const envValue = process.env[envVarName];
    if (envValue === undefined) {
      throw new Error(
        `Missing env var "${envVarName}" for ${value} macro. ` +
        `Add it to .env or run the Ralphchives setup scripts.`,
      );
    }
    return envValue;
  }

  const resolver = MACROS[value];
  if (!resolver) {
    const known = Object.keys(MACROS).join(", ");
    throw new Error(`Unknown macro "${value}" in MCP server config. Known macros: ${known}, $trigger.<key>, $variantEnv.<PREFIX>`);
  }
  return resolver(workItem);
}

/** Public contract for JIT MCP param injection. */
export interface IJitMcpConfigWriter {
  /**
   * Inject profile-level env vars (static + resolved macros) into the profile's `gateway.json`.
   *
   * Reads the profile's `mcpServerConfigs`, resolves any `$macro` values from the
   * current JIRA issue, and merges them into the corresponding server's `env` block
   * in `gateway.json`. Values prefixed with `$trigger.` are resolved from the
   * optional `triggerParams` map. Static values and secrets already in the env block
   * are preserved.
   *
   * No-ops silently when the profile has no MCP servers, no server configs, or
   * `gateway.json` does not exist.
   */
  write(profile: IAgentProfile, workItem: JiraIssue, logger: Logger, triggerParams?: Record<string, string>): void;
}

/**
 * Injects profile-level env vars into the MCP sidecar's gateway config.
 *
 * Before each task, reads the profile's `.build/gateway.json`, resolves
 * `$macro` values from the JIRA issue, merges static + resolved values
 * into each server's env block, and writes the augmented config back.
 *
 * Uses synchronous I/O because `gateway.json` is small (~1-2 KB) and
 * must be written before the container starts in the same tick.
 */
export class JitMcpConfigWriter implements IJitMcpConfigWriter {
  write(profile: IAgentProfile, workItem: JiraIssue, logger: Logger, triggerParams?: Record<string, string>): void {
    if (profile.mcpServers.length === 0) return;
    if (!profile.mcpServerConfigs || Object.keys(profile.mcpServerConfigs).length === 0) return;

    const gatewayPath = this.resolveGatewayPath(profile);
    if (!existsSync(gatewayPath)) {
      logger.warn(`gateway.json not found at ${gatewayPath} — skipping JIT MCP param injection`);
      return;
    }

    const gateway: GatewayConfig = JSON.parse(readFileSync(gatewayPath, "utf-8"));
    let injected = 0;

    for (const [serverName, envConfig] of Object.entries(profile.mcpServerConfigs)) {
      if (!profile.mcpServers.includes(serverName)) continue;

      const entry = gateway.servers.find((s: GatewayServerEntry) => s.name === serverName);
      if (!entry) {
        logger.warn(`Server "${serverName}" declared in profile but not found in gateway.json — skipping`);
        continue;
      }

      for (const [envVar, rawValue] of Object.entries(envConfig)) {
        const value = resolveEnvValue(rawValue, workItem, triggerParams, profile);
        entry.env[envVar] = value;
        injected++;
      }
    }

    if (injected > 0) {
      writeFileSync(gatewayPath, JSON.stringify(gateway, null, 2) + "\n", "utf-8");
      logger.info(`Injected ${injected} env var(s) into gateway.json for ${workItem.key}`);
    }
  }

  private resolveGatewayPath(profile: IAgentProfile): string {
    const profileDir = resolve(process.cwd(), "profiles", profile.id);
    return join(profileDir, ".build", "gateway.json");
  }
}
