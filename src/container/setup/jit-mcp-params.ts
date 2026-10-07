import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import type { IAgentProfile } from "../../config/types";
import type { WorkItem } from "../../datasource/types";
import type { Logger } from "../../logger";
import type { GatewayConfig, GatewayServerEntry } from "./mcp-config";
import { slugifyBranchName } from "../../util/branch";
import { profileBuildPaths } from "./build-paths";

export interface BranchResolutionContext {
  readonly sourceBranch?: string;
  readonly taskBranch?: string;
}

/** Known runtime macros resolved from the current work item context. */
const MACROS: Record<
  string,
  (workItem: WorkItem, triggerParams?: Record<string, string>, branchContext?: BranchResolutionContext) => string
> = {
  "$task.id": (workItem) => workItem.id,
  "$task.project": (workItem) => workItem.project,
  "$task.branch": (workItem, triggerParams, branchContext) =>
    branchContext?.taskBranch ?? triggerParams?.["branch"] ?? slugifyBranchName(workItem.id, workItem.title),
  "$task.title": (workItem) => workItem.title,
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
 * a `$trigger.<key>` reference resolved from comment trigger params,
 * or a `$variantEnv.PREFIX` reference resolved from process.env using a
 * variant-scoped env var name (`PREFIX_PROFILEID_DISPLAYNAME`).
 *
 * @throws If a `$`-prefixed value doesn't match any known macro or trigger prefix.
 */
function resolveEnvValue(
  value: string,
  workItem: WorkItem,
  triggerParams?: Record<string, string>,
  profile?: IAgentProfile,
  branchContext?: BranchResolutionContext,
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
        `Missing env var "${envVarName}" for ${value} macro. ` + `Add it to .env or run the Ralphchives setup scripts.`,
      );
    }
    return envValue;
  }

  const resolver = MACROS[value];
  if (!resolver) {
    const known = Object.keys(MACROS).join(", ");
    throw new Error(
      `Unknown macro "${value}" in MCP server config. Known macros: ${known}, $trigger.<key>, $variantEnv.<PREFIX>`,
    );
  }
  return resolver(workItem, triggerParams, branchContext);
}

/**
 * Inject profile-level env vars (static + resolved macros) into the profile's `gateway.json`.
 *
 * Reads the profile's `mcpServerConfigs`, resolves any `$macro` values from the
 * current work item, and merges them into the corresponding server's `env` block
 * in `gateway.json`. Values prefixed with `$trigger.` are resolved from the
 * optional `triggerParams` map. Static values and secrets already in the env block
 * are preserved.
 *
 * No-ops silently when the profile has no MCP servers, no server configs, or
 * `gateway.json` does not exist.
 *
 * Uses synchronous I/O because `gateway.json` is small (~1-2 KB) and
 * must be written before the container starts in the same tick.
 *
 * @param rootDir The orchestrator checkout root holding `profiles/<id>/.build/gateway.json`.
 * @throws If an env value uses an unknown macro or a missing variant env var.
 */
export function writeJitMcpConfig(
  profile: IAgentProfile,
  workItem: WorkItem,
  rootDir: string,
  logger: Logger,
  triggerParams?: Record<string, string>,
  branchContext?: BranchResolutionContext,
): void {
  if (profile.mcpServers.length === 0) return;
  if (!profile.mcpServerConfigs || Object.keys(profile.mcpServerConfigs).length === 0) return;

  const gatewayPath = resolveGatewayPath(profile, rootDir);
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
      const value = resolveEnvValue(rawValue, workItem, triggerParams, profile, branchContext);
      entry.env[envVar] = value;
      injected++;
    }
  }

  if (injected > 0) {
    writeFileSync(gatewayPath, JSON.stringify(gateway, null, 2) + "\n", "utf-8");
    logger.info(`Injected ${injected} env var(s) into gateway.json for ${workItem.id}`);
  }
}

function resolveGatewayPath(profile: IAgentProfile, rootDir: string): string {
  return join(profileBuildPaths(rootDir, profile.id).buildDir, "gateway.json");
}
