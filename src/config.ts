import { readdirSync, readFileSync } from "node:fs";
import { resolve, join } from "node:path";
import { z } from "zod";
import "dotenv/config";
import { buildJqlFromProfiles } from "./jira/jql-builder.js";
import { resolvePath } from "./util/path.js";

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

const configFileSchema = z.object({
  jira: rawJiraSchema,
  output: rawOutputSchema,
  dashboard: rawDashboardSchema,
});

// ---------------------------------------------------------------------------
// Zod schemas for profiles/*/profile.json
// ---------------------------------------------------------------------------

const profileMatchSchema = z.object({
  projects: z.array(z.string()).default([]),
  keywords: z.array(z.string()).default([]),
  statuses: z.array(z.string()).default([]),
  revisionStatuses: z.array(z.string()).default([]),
  commentTrigger: z.string().optional(),
});

const profileTransitionsSchema = z.object({
  inProgressId: z.string().min(1, "transitions.inProgressId is required"),
  readyForReviewId: z.string().min(1, "transitions.readyForReviewId is required"),
  revisionId: z.string().optional(),
});

const variantSchema = z.object({
  agent: z.string().min(1, "variant agent must not be empty"),
  model: z.string().optional(),
  match: profileMatchSchema,
});

const profileFileSchema = z.object({
  repo: z.string().min(1, "Profile repo path must not be empty"),
  cli: z.enum(["copilot", "claude"]).default("copilot"),
  model: z.string().optional(),
  timeoutMs: z.number().positive().default(1_800_000),
  setupScript: z.string().default("/usr/local/bin/setup.sh"),
  auditLogPath: z.string().default("/workspace/.ralph/logs/audit.jsonl"),
  composeProjectLabel: z.string().default("ralph-sandbox"),
  transitions: profileTransitionsSchema,
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
  keywords: string[];
  statuses: string[];
  /** Statuses that trigger a revision workflow (e.g. "Defect Found"). Issues in these statuses bypass queue dedup. */
  revisionStatuses: string[];
  /** When set, at least one comment on the issue must contain this string (case-insensitive) for the variant to match. */
  commentTrigger?: string;
}

/** JIRA transition IDs for this profile's workflow. */
export interface ProfileTransitions {
  /** Transition ID to move an issue to "In Progress". */
  inProgressId: string;
  /** Transition ID to move an issue to "Ready for Review". */
  readyForReviewId: string;
  /** Transition ID for moving a revision issue (e.g. "Defect Found") to "In Progress". Falls back to `inProgressId`. */
  revisionId?: string;
}

export interface AgentProfile {
  id: string;
  repoPath: string;
  /** Path to docker-compose.yml relative to the orchestrator root. Defaults to `profiles/<id>/docker-compose.yml`. */
  composeFile: string;
  agentName: string;
  /** Which CLI to use for agent execution. */
  cli: "copilot" | "claude";
  /** Model override (e.g. `claude-opus-4.6`). Optional — CLI default is used when omitted. */
  model?: string;
  timeoutMs: number;
  /** Absolute path to the setup script inside the container. */
  setupScript: string;
  /** Absolute path to the audit JSONL log inside the container. */
  auditLogPath: string;
  /** Docker compose project label for container lookup. */
  composeProjectLabel: string;
  match: ProfileMatch;
  transitions: ProfileTransitions;
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
}

export interface DashboardConfig {
  enabled: boolean;
  url: string;
  secret: string;
  intervalMs: number;
}

export interface AppConfig {
  jira: JiraConfig;
  profiles: AgentProfile[];
  output: OutputConfig;
  dashboard: DashboardConfig;
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
      const statusSet = new Set(variant.match.statuses.map((s) => s.toLowerCase()));
      const overlap = variant.match.revisionStatuses.filter((s) => statusSet.has(s.toLowerCase()));
      if (overlap.length > 0) {
        throw new Error(
          `Profile "${profileId}" variant "${variant.agent}": statuses and revisionStatuses must not overlap — found in both: ${overlap.join(", ")}`
        );
      }

      profiles.push({
        id: profileId,
        repoPath: resolvePath(parsed.repo),
        composeFile: `profiles/${profileId}/docker-compose.yml`,
        agentName: variant.agent,
        cli: parsed.cli,
        model: variant.model ?? parsed.model,
        timeoutMs: parsed.timeoutMs,
        setupScript: parsed.setupScript,
        auditLogPath: parsed.auditLogPath,
        composeProjectLabel: parsed.composeProjectLabel,
        match: {
          projects: variant.match.projects,
          keywords: variant.match.keywords,
          statuses: variant.match.statuses,
          revisionStatuses: variant.match.revisionStatuses,
        },
        transitions: {
          inProgressId: parsed.transitions.inProgressId,
          readyForReviewId: parsed.transitions.readyForReviewId,
          revisionId: parsed.transitions.revisionId,
        },
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
    secrets,
  };
}
