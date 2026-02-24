import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { resolve, join } from "node:path";
import type { AgentProfile } from "../../config.js";
import type { JiraIssue } from "../../jira/types.js";
import type { Logger } from "../../logger.js";
import type { GatewayConfig, GatewayServerEntry } from "./mcp-config.js";
import { slugifyBranchName } from "../../util/branch.js";

/** Known runtime macros resolved from the current JIRA issue context. */
const MACROS: Record<string, (issue: JiraIssue) => string> = {
  "$jira.key": (issue) => issue.key,
  "$jira.project": (issue) => issue.key.split("-")[0],
  "$jira.branch": (issue) => slugifyBranchName(issue.key, issue.fields.summary ?? ""),
  "$jira.summary": (issue) => issue.fields.summary ?? "",
};

const TRIGGER_PREFIX = "$trigger.";

/**
 * Resolve an env var value — either a static string, a `$macro` reference,
 * or a `$trigger.<key>` reference resolved from JIRA comment trigger params.
 *
 * @throws If a `$`-prefixed value doesn't match any known macro or trigger prefix.
 */
function resolveEnvValue(value: string, issue: JiraIssue, triggerParams?: Record<string, string>): string {
  if (!value.startsWith("$")) return value;

  if (value.startsWith(TRIGGER_PREFIX)) {
    const key = value.slice(TRIGGER_PREFIX.length);
    return triggerParams?.[key] ?? "";
  }

  const resolver = MACROS[value];
  if (!resolver) {
    const known = Object.keys(MACROS).join(", ");
    throw new Error(`Unknown macro "${value}" in MCP server config. Known macros: ${known}, $trigger.<key>`);
  }
  return resolver(issue);
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
  write(profile: AgentProfile, issue: JiraIssue, logger: Logger, triggerParams?: Record<string, string>): void;
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
  write(profile: AgentProfile, issue: JiraIssue, logger: Logger, triggerParams?: Record<string, string>): void {
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
        const value = resolveEnvValue(rawValue, issue, triggerParams);
        entry.env[envVar] = value;
        injected++;
      }
    }

    if (injected > 0) {
      writeFileSync(gatewayPath, JSON.stringify(gateway, null, 2) + "\n", "utf-8");
      logger.info(`Injected ${injected} env var(s) into gateway.json for ${issue.key}`);
    }
  }

  private resolveGatewayPath(profile: AgentProfile): string {
    const profileDir = resolve(process.cwd(), "profiles", profile.id);
    return join(profileDir, ".build", "gateway.json");
  }
}
