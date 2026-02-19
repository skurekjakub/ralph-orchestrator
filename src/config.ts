import { readdirSync, readFileSync } from "node:fs";
import { resolve, join } from "node:path";
import { z } from "zod";
import "dotenv/config";
import { buildJqlFromProfiles } from "./jira/jql-builder.js";
import { resolvePath } from "./util/path.js";
import { AuditMode } from "./prompt/prompt-auditor.js";
import { CliType } from "./container/types.js";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Default model for Copilot CLI when no profile-level override is set. */
export const DEFAULT_MODEL = "claude-opus-4.6";

// ---------------------------------------------------------------------------
// Zod schemas for config.json (global settings only)
// ---------------------------------------------------------------------------

const rawJiraSchema = z.object({
  baseUrl: z.string().url("jira.baseUrl must be a valid URL"),
  cloudId: z.string().min(1, "jira.cloudId must not be empty"),
  pollIntervalMs: z.number().positive().default(60_000),
});

const rawOutputSchema = z.object({
  logDir: z.string().default("./output/logs"),
  handoffDir: z.string().default("./output/handoffs"),
}).optional();

const rawDashboardSchema = z.object({
  enabled: z.boolean().default(true),
  intervalMs: z.number().positive().default(30_000),
}).optional();

const rawPromptAuditSchema = z.object({
  /** How the auditor handles findings: "block" rejects critical findings, "warn" logs only, "off" skips. */
  mode: z.enum(["block", "warn", "off"]).default("warn"),
}).optional();

const configFileSchema = z.object({
  jira: rawJiraSchema,
  output: rawOutputSchema,
  dashboard: rawDashboardSchema,
  promptAudit: rawPromptAuditSchema,
  /** Custom field IDs to exclude from agent prompts (e.g. boilerplate form templates). */
  excludeFields: z.array(z.string()).default([]),
});

// ---------------------------------------------------------------------------
// Zod schemas for profiles/*/profile.json
// ---------------------------------------------------------------------------

const profileMatchSchema = z.object({
  projects: z.array(z.string()).default([]),
  statuses: z.array(z.string()).default([]),
  commentTrigger: z.string().min(1, "match.commentTrigger is required"),
  revisionStatuses: z.array(z.string()).default([]),
});

const agentTransitionSchema = z.object({
  targetStatus: z.string().optional(),
}).default({});

const variantSchema = z.object({
  agent: z.string().min(1, "variant agent must not be empty"),
  model: z.string().optional(),
  match: profileMatchSchema,
  beforeAgent: agentTransitionSchema,
  afterAgent: agentTransitionSchema,
  preflight: z.string().optional(),
  failureComment: z.string().optional(),
});

/** Resource mount config — auto-discovers files in the profile's resources/ directory. */
const resourcesSchema = z.object({
  /** Container path prefix (relative to /workspace) where resource files are mounted. */
  mountBase: z.string().min(1),
}).optional();

const profileFileSchema = z.object({
  repo: z.string().min(1, "Profile repo path must not be empty"),
  cli: z.enum(["copilot", "claude"]).default("copilot"),
  model: z.string().optional(),
  timeoutMs: z.number().positive().default(1_800_000),
  setupScript: z.string().default("/usr/local/bin/setup.sh"),
  auditLogPath: z.string().default("/workspace/.ralph/logs/audit.jsonl"),
  composeProjectLabel: z.string().default("ralph-sandbox"),
  /** Paths inside the container (absolute) to delete before each agent run. */
  cleanPaths: z.array(z.string()).default([]),
  /** MCP servers to deploy into the container (references shared/mcp-servers/<name>/). */
  mcpServers: z.array(z.string()).default([]),
  /** Resource files auto-discovered from the profile's resources/ directory and mounted into the container. */
  resources: resourcesSchema,
  variants: z.array(variantSchema).min(1, "At least one variant must be defined"),
});

// ---------------------------------------------------------------------------
// Runtime types (post-resolution)
// ---------------------------------------------------------------------------

export interface JiraConfig {
  baseUrl: string;
  cloudId: string;
  jql: string[];
  pollIntervalMs: number;
}

export interface ProfileMatch {
  projects: string[];
  statuses: string[];
  /** Comment trigger string — at least one comment must contain this (case-insensitive) for the variant to match. */
  commentTrigger: string;
  /** Statuses that indicate a revision task (e.g. "Defect Found"). When the issue is in one of these statuses, the agent follows the revision workflow. */
  revisionStatuses: string[];
}

/** Optional JIRA transition to execute before or after agent work. Empty = no transition (observer). */
export interface AgentTransition {
  targetStatus?: string;
}

export interface AgentProfile {
  id: string;
  repoPath: string;
  /** Path to docker-compose.yml relative to the orchestrator root. Defaults to `profiles/<id>/docker-compose.yml`. */
  composeFile: string;
  /** Raw agent name as registered by the CLI (e.g. `ralph.ralph`). Used as the `--agent` argument. */
  agentName: string;
  /** Human-friendly agent name for JIRA comments and logs (strips `ralph.` prefix). */
  displayName: string;
  /** Unique variant identifier: `<profileId>:<agentName>:<commentTrigger>`. Used for ledger dedup and profile lookup. */
  variantKey: string;
  /** Which CLI to use for agent execution. */
  cli: CliType;
  /** Model override (e.g. `claude-opus-4.6`). Optional — CLI default is used when omitted. */
  model?: string;
  timeoutMs: number;
  /** Absolute path to the setup script inside the container. */
  setupScript: string;
  /** Absolute path to the audit JSONL log inside the container. */
  auditLogPath: string;
  /** Docker compose project label for container lookup. */
  composeProjectLabel: string;
  /** Absolute paths inside the container to delete before each agent run. */
  cleanPaths: string[];
  /** MCP server names to deploy into the container (from shared/mcp-servers/). */
  mcpServers: string[];
  match: ProfileMatch;
  /** JIRA transition to execute before agent work. Empty = no transition. */
  beforeAgent: AgentTransition;
  /** JIRA transition to execute after agent work. Empty = no transition. */
  afterAgent: AgentTransition;
  /** Named preflight check to run before agent invocation. If it fails, the agent is not invoked. */
  preflight?: string;
  /** JIRA comment posted when preflight fails. Falls back to a generic message. */
  failureComment?: string;
}

export interface OutputConfig {
  logDir: string;
  handoffDir: string;
}

export interface SecretsConfig {
  ghToken: string;
  adoPatDocs: string;
  adoPatXperience: string;
  jiraPat: string;
  jiraEmail: string;
  /** Anthropic API key for Claude Code CLI. Optional — only needed when a profile uses `cli: "claude"`. */
  anthropicApiKey: string;
  /** Discord bot token for the discord-hitl MCP server. Optional — only needed when a profile uses the discord-hitl MCP server. */
  discordBotToken: string;
  /** Discord channel ID where HITL threads are created. Optional — paired with discordBotToken. */
  discordChannelId: string;
}

export interface DashboardConfig {
  enabled: boolean;
  url: string;
  secret: string;
  intervalMs: number;
}

/** Configuration for the prompt injection auditor. */
export interface PromptAuditConfig {
  /** How the auditor handles findings: "block" rejects critical findings, "warn" logs only, "off" skips auditing. */
  mode: AuditMode;
}

export interface AppConfig {
  jira: JiraConfig;
  profiles: AgentProfile[];
  output: OutputConfig;
  dashboard: DashboardConfig;
  promptAudit: PromptAuditConfig;
  /** Custom field IDs to exclude from agent prompts. */
  excludeFields: string[];
  secrets: SecretsConfig;
}

// ---------------------------------------------------------------------------
// Profile discovery
// ---------------------------------------------------------------------------

/**
 * Discover and load all profile.json files from `profiles/` subdirectories.
 *
 * Each `profiles/<id>/profile.json` is validated with Zod, then "exploded"
 * into one {@link AgentProfile} per variant. The `id` is derived from the
 * directory name; `composeFile` is `profiles/<id>/docker-compose.yml`.
 */
function loadProfiles(profilesDir: string): AgentProfile[] {
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

  const profiles: AgentProfile[] = [];

  for (const dirName of dirs) {
    const profileJsonPath = join(profilesDir, dirName, "profile.json");
    let rawJson: unknown;
    try {
      rawJson = JSON.parse(readFileSync(profileJsonPath, "utf-8"));
    } catch (err) {
      throw new Error(
        `Failed to read ${profileJsonPath}: ${err instanceof Error ? err.message : String(err)}`
      );
    }

    const parsed = profileFileSchema.parse(rawJson);
    const profileId = dirName;

    for (let vi = 0; vi < parsed.variants.length; vi++) {
      const variant = parsed.variants[vi];

      profiles.push({
        id: profileId,
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
        mcpServers: parsed.mcpServers,
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
export function loadConfig(): AppConfig {
  const configPath = resolve(process.cwd(), "config.json");

  let rawJson: unknown;
  try {
    rawJson = JSON.parse(readFileSync(configPath, "utf-8"));
  } catch (err) {
    throw new Error(
      `Failed to read config.json at ${configPath}: ${err instanceof Error ? err.message : String(err)}`
    );
  }

  const parsed = configFileSchema.parse(rawJson);

  const jiraPat = process.env.JIRA_PAT;
  const jiraEmail = process.env.JIRA_EMAIL;
  if (!jiraPat || !jiraEmail) {
    throw new Error("JIRA_PAT and JIRA_EMAIL must be set in .env");
  }

  const ghToken = process.env.GH_TOKEN;
  const adoPatDocs = process.env.ADO_PAT_DOCS;
  if (!ghToken || !adoPatDocs) {
    throw new Error("GH_TOKEN and ADO_PAT_DOCS must be set in .env");
  }

  const secrets: SecretsConfig = {
    ghToken,
    adoPatDocs,
    adoPatXperience: process.env.ADO_PAT_XPERIENCE ?? "",
    jiraPat,
    jiraEmail,
    anthropicApiKey: process.env.ANTHROPIC_API_KEY ?? "",
    discordBotToken: process.env.DISCORD_BOT_TOKEN ?? "",
    discordChannelId: process.env.DISCORD_CHANNEL_ID ?? "",
  };

  const dashboardUrl = process.env.DASHBOARD_URL ?? "";
  const dashboardSecret = process.env.DASHBOARD_SECRET ?? "";
  const dashboard: DashboardConfig = {
    enabled: (parsed.dashboard?.enabled ?? true) && !!dashboardUrl && !!dashboardSecret,
    url: dashboardUrl,
    secret: dashboardSecret,
    intervalMs: parsed.dashboard?.intervalMs ?? 30_000,
  };

  const profilesDir = resolve(process.cwd(), "profiles");
  const profiles = loadProfiles(profilesDir);

  const jql = buildJqlFromProfiles(profiles);

  return {
    jira: {
      baseUrl: parsed.jira.baseUrl,
      cloudId: parsed.jira.cloudId,
      jql,
      pollIntervalMs: parsed.jira.pollIntervalMs,
    },
    profiles,
    output: {
      logDir: resolve(process.cwd(), parsed.output?.logDir ?? "./output/logs"),
      handoffDir: resolve(process.cwd(), parsed.output?.handoffDir ?? "./output/handoffs"),
    },
    dashboard,
    promptAudit: {
      mode: (parsed.promptAudit?.mode ?? AuditMode.Warn) as AuditMode,
    },
    excludeFields: parsed.excludeFields ?? [],
    secrets,
  };
}
