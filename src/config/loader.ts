import { readdirSync, readFileSync } from "node:fs";
import { resolve, join } from "node:path";
import "dotenv/config";
import { resolvePath } from "../util/path.js";
import { AuditMode } from "../prompt/prompt-auditor.js";
import type { CliType } from "../container/types.js";
import { toErrorMessage } from "../util/error.js";
import { configFileSchema, jiraConnectionSchema, profileFileSchema } from "./schemas.js";
import type {
  IAppConfig,
  IAgentProfile,
  IDataSourceConfig,
  IJiraConnectionConfig,
  ISecretsConfig,
  IDashboardConfig,
} from "./types.js";
import { DataSourceType } from "./types.js";

// ---------------------------------------------------------------------------
// Profile discovery
// ---------------------------------------------------------------------------

/**
 * Discover and load all profile.json files from `profiles/` subdirectories.
 *
 * Each `profiles/<id>/profile.json` is validated with Zod, then "exploded"
 * into one {@link IAgentProfile} per variant. The `id` is derived from the
 * directory name; `composeFile` is `profiles/<id>/docker-compose.yml`.
 */
function loadProfiles(profilesDir: string): IAgentProfile[] {
  let dirs: string[];
  try {
    dirs = readdirSync(profilesDir, { withFileTypes: true })
      .filter((d) => d.isDirectory())
      .map((d) => d.name);
  } catch {
    throw new Error(`Cannot read profiles directory: ${profilesDir}`);
  }

  if (dirs.length === 0) {
    throw new Error(`No profile directories found in ${profilesDir}`);
  }

  const profiles: IAgentProfile[] = [];

  for (const dirName of dirs) {
    const profileJsonPath = join(profilesDir, dirName, "profile.json");
    let rawJson: unknown;
    try {
      rawJson = JSON.parse(readFileSync(profileJsonPath, "utf-8"));
    } catch (err) {
      throw new Error(
        `Failed to read ${profileJsonPath}: ${toErrorMessage(err)}`
      );
    }

    const parsed = profileFileSchema.parse(rawJson);
    const profileId = dirName;

    // Normalize mixed mcpServers array into names + configs
    const mcpServers: string[] = [];
    const mcpServerConfigs: Record<string, Record<string, string>> = {};
    for (const entry of parsed.mcpServers) {
      if (typeof entry === "string") {
        mcpServers.push(entry);
      } else {
        mcpServers.push(entry.name);
        if (entry.env && Object.keys(entry.env).length > 0) {
          mcpServerConfigs[entry.name] = entry.env;
        }
      }
    }

    const uniqueServers = new Set(mcpServers);
    if (uniqueServers.size !== mcpServers.length) {
      const dupes = mcpServers.filter((s, i) => mcpServers.indexOf(s) !== i);
      throw new Error(`Profile "${profileId}": duplicate MCP server(s): ${[...new Set(dupes)].join(", ")}`);
    }

    for (let vi = 0; vi < parsed.variants.length; vi++) {
      const variant = parsed.variants[vi];

      profiles.push({
        id: profileId,
        dataSource: parsed.dataSource,
        repoPath: resolvePath(parsed.repo),
        composeFile: `profiles/${profileId}/docker-compose.yml`,
        agentName: variant.agent,
        displayName: variant.agent.replace(/^ralph\./, ""),
        variantKey: `${profileId}:${variant.agent}:${variant.match.commentTrigger}`,
        cli: parsed.cli as CliType,
        model: variant.model ?? parsed.model,
        timeoutMs: parsed.timeoutMs,
        setupScript: parsed.setupScript,
        auditLogPath: parsed.auditLogPath,
        composeProjectLabel: parsed.composeProjectLabel,
        cleanPaths: parsed.cleanPaths,
        maxContinuations: parsed.maxContinuations,
        mcpServers,
        mcpServerConfigs,
        githubMcpTools: parsed.githubMcpTools,
        match: {
          projects: variant.match.projects,
          statuses: variant.match.statuses,
          commentTrigger: variant.match.commentTrigger,
          revisionStatuses: variant.match.revisionStatuses,
        },
        beforeAgent: variant.beforeAgent,
        afterAgent: variant.afterAgent,
        preflight: variant.preflight,
        failureComment: variant.failureComment,
        skills: parsed.skills,
      });
    }
  }

  return profiles;
}

// ---------------------------------------------------------------------------
// Config loader
// ---------------------------------------------------------------------------

/**
 * Load and validate configuration from `config.json` (Zod-validated) and `.env` (secrets).
 *
 * Resolves all repo paths (expands `~`, strips quotes).
 * Throws a descriptive {@link ZodError} if config.json has invalid structure,
 * or a plain {@link Error} for missing environment variables.
 */
export function loadConfig(): IAppConfig {
  const configPath = resolve(process.cwd(), "config.json");

  let rawJson: unknown;
  try {
    rawJson = JSON.parse(readFileSync(configPath, "utf-8"));
  } catch (err) {
    throw new Error(
      `Failed to read config.json at ${configPath}: ${toErrorMessage(err)}`
    );
  }

  const parsed = configFileSchema.parse(rawJson);

  // ── Data sources ──────────────────────────────────────────────────────────
  const dataSources: Record<string, IDataSourceConfig> = {};
  for (const [key, raw] of Object.entries(parsed.dataSources)) {
    const envKey = key.toUpperCase().replace(/-/g, "_");
    if (raw.type === DataSourceType.Jira) {
      const conn = jiraConnectionSchema.parse(raw.connection);
      const pat = process.env[`JIRA_PAT_${envKey}`];
      const email = process.env[`JIRA_EMAIL_${envKey}`];
      if (!pat || !email) {
        throw new Error(
          `JIRA_PAT_${envKey} and JIRA_EMAIL_${envKey} must be set in .env for data source "${key}"`,
        );
      }
      const jiraConn: IJiraConnectionConfig = {
        baseUrl: conn.baseUrl,
        cloudId: conn.cloudId,
        excludeFields: conn.excludeFields,
        allowedUsers: conn.allowedUsers,
        email,
        apiToken: pat,
      };
      dataSources[key] = {
        type: raw.type,
        connection: jiraConn as unknown as Readonly<Record<string, unknown>>,
        pollIntervalMs: raw.pollIntervalMs,
        maxResults: raw.maxResults,
      };
    } else {
      throw new Error(`Unsupported data source type "${raw.type}" for "${key}"`);
    }
  }

  // ── Global secrets ────────────────────────────────────────────────────────
  const ghToken = process.env.GH_TOKEN;
  const adoPat = process.env.ADO_PAT;
  if (!ghToken || !adoPat) {
    throw new Error("GH_TOKEN and ADO_PAT must be set in .env");
  }

  const secrets: ISecretsConfig = {
    ghToken,
    adoPat,
    adoPatXperience: process.env.ADO_PAT_XPERIENCE ?? "",
    anthropicApiKey: process.env.ANTHROPIC_API_KEY ?? "",
    discordBotToken: process.env.DISCORD_BOT_TOKEN ?? "",
    discordChannelId: process.env.DISCORD_CHANNEL_ID ?? "",
  };

  const dashboardUrl = process.env.DASHBOARD_URL ?? "";
  const dashboardSecret = process.env.DASHBOARD_SECRET ?? "";
  const dashboard: IDashboardConfig = {
    enabled: (parsed.dashboard?.enabled ?? true) && !!dashboardUrl && !!dashboardSecret,
    url: dashboardUrl,
    secret: dashboardSecret,
    intervalMs: parsed.dashboard?.intervalMs ?? 30_000,
  };

  const profilesDir = resolve(process.cwd(), "profiles");
  const profiles = loadProfiles(profilesDir);

  // Validate profile dataSource references
  for (const profile of profiles) {
    if (!dataSources[profile.dataSource]) {
      throw new Error(
        `Profile "${profile.id}" variant "${profile.displayName}" references unknown data source "${profile.dataSource}". ` +
        `Available: ${Object.keys(dataSources).join(", ")}`,
      );
    }
  }

  return {
    dataSources,
    profiles,
    output: {
      logDir: resolve(process.cwd(), parsed.output?.logDir ?? "./output/logs"),
      handoffDir: resolve(process.cwd(), parsed.output?.handoffDir ?? "./output/handoffs"),
    },
    dashboard,
    promptAudit: {
      mode: (parsed.promptAudit?.mode ?? AuditMode.Warn) as AuditMode,
    },
    ralphchives: {
      enabled: parsed.ralphchives?.enabled ?? false,
      nodebbApiUrl: parsed.ralphchives?.nodebbApiUrl ?? "http://localhost:4567",
      neo4jUri: parsed.ralphchives?.neo4jUri ?? "bolt://localhost:7687",
      neo4jUser: parsed.ralphchives?.neo4jUser ?? "neo4j",
    },
    enableContinuation: parsed.enableContinuation ?? false,
    secrets,
  };
}
