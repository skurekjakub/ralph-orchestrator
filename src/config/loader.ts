import { readdirSync, readFileSync } from "node:fs";
import { resolve, join } from "node:path";
import "dotenv/config";
import { AuditMode } from "../prompt/prompt-auditor";
import { toErrorMessage } from "../util/error";
import { readProfileFile, resolveProfileVariants } from "./profile-variants";
import { configFileSchema } from "./schemas";
import type { IAppConfig, IAgentProfile, IDataSourceConfig, ISecretsConfig, IDashboardConfig } from "./types";

// ---------------------------------------------------------------------------
// Profile discovery
// ---------------------------------------------------------------------------

/**
 * Discover and load all profile.json files from `profiles/` subdirectories.
 *
 * Each `profiles/<id>/profile.json` is validated with Zod, then expanded into
 * one {@link IAgentProfile} per variant by {@link resolveProfileVariants}.
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

  return dirs.flatMap((dirName) =>
    resolveProfileVariants(readProfileFile(join(profilesDir, dirName, "profile.json")), dirName),
  );
}

// ---------------------------------------------------------------------------
// Config loader
// ---------------------------------------------------------------------------

/**
 * Load and validate configuration from `config.json` (Zod-validated) and `.env` (secrets).
 *
 * Resolves all repo paths (expands `~`, strips quotes). Credentials are read as given, an unset
 * one as an empty string: which of them are required depends on the CLIs the stages run, and
 * startup validation enforces that.
 *
 * @throws ZodError when config.json or a profile.json breaks its schema; Error when a file is
 *   unreadable or a profile references an unknown data source.
 */
export function loadConfig(): IAppConfig {
  const configPath = resolve(process.cwd(), "config.json");

  let rawJson: unknown;
  try {
    rawJson = JSON.parse(readFileSync(configPath, "utf-8"));
  } catch (err) {
    throw new Error(`Failed to read config.json at ${configPath}: ${toErrorMessage(err)}`);
  }

  const parsed = configFileSchema.parse(rawJson);

  // ── Data sources ──────────────────────────────────────────────────────────
  // Connection config is passed through as-is — each registered factory is
  // responsible for its own connection validation and env var injection.
  const dataSources: Record<string, IDataSourceConfig> = {};
  for (const [key, raw] of Object.entries(parsed.dataSources)) {
    dataSources[key] = {
      type: raw.type,
      connection: raw.connection as Readonly<Record<string, unknown>>,
      pollIntervalMs: raw.pollIntervalMs,
    };
  }

  // ── Global secrets ────────────────────────────────────────────────────────
  const secrets: ISecretsConfig = {
    ghToken: process.env.GH_TOKEN ?? "",
    adoPat: process.env.ADO_PAT ?? "",
    adoPatXperience: process.env.ADO_PAT_XPERIENCE ?? "",
    anthropicApiKey: process.env.ANTHROPIC_API_KEY ?? "",
    claudeCodeOauthToken: process.env.CLAUDE_CODE_OAUTH_TOKEN ?? "",
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
    claudeAuth: parsed.claudeAuth,
    secrets,
  };
}
