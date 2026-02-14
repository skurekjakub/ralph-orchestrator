import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { z } from "zod";
import "dotenv/config";
import { buildJqlFromProfiles } from "./jira/jql-builder.js";

// ---------------------------------------------------------------------------
// Zod schemas for config.json
// ---------------------------------------------------------------------------

const profileMatchSchema = z.object({
  projects: z.array(z.string()).default([]),
  keywords: z.array(z.string()).default([]),
  statuses: z.array(z.string()).default([]),
  revisionStatuses: z.array(z.string()).default([]),
});

const profileTransitionsSchema = z.object({
  inProgressId: z.string().min(1, "transitions.inProgressId is required"),
  readyForReviewId: z.string().min(1, "transitions.readyForReviewId is required"),
  revisionId: z.string().optional(),
});

const rawProfileSchema = z.object({
  id: z.string().min(1, "Profile id must not be empty"),
  repo: z.string().min(1, "Profile repo path must not be empty"),
  composeFile: z.string().default(".ralph/docker-compose.yml"),
  agent: z.string().default("ralph"),
  timeoutMs: z.number().positive().default(1_800_000),
  match: profileMatchSchema,
  transitions: profileTransitionsSchema,
});

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
  profiles: z.array(rawProfileSchema).min(1, "At least one agent profile must be defined"),
  output: rawOutputSchema,
  dashboard: rawDashboardSchema,
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
  /** Relative path to docker-compose.yml within the repo. */
  composeFile: string;
  agentName: string;
  timeoutMs: number;
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
// Path resolution
// ---------------------------------------------------------------------------

function resolvePath(rawPath: string): string {
  const cleaned = rawPath.replace(/^["']|["']$/g, "");
  return cleaned.startsWith("~/")
    ? resolve(process.env.HOME ?? "/root", cleaned.slice(2))
    : resolve(cleaned);
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
  };

  const dashboardUrl = process.env.DASHBOARD_URL ?? "";
  const dashboardSecret = process.env.DASHBOARD_SECRET ?? "";
  const dashboard: DashboardConfig = {
    enabled: (parsed.dashboard?.enabled ?? true) && !!dashboardUrl && !!dashboardSecret,
    url: dashboardUrl,
    secret: dashboardSecret,
    intervalMs: parsed.dashboard?.intervalMs ?? 30_000,
  };

  const profiles: AgentProfile[] = parsed.profiles.map((p) => ({
    id: p.id,
    repoPath: resolvePath(p.repo),
    composeFile: p.composeFile,
    agentName: p.agent,
    timeoutMs: p.timeoutMs,
    match: {
      projects: p.match.projects,
      keywords: p.match.keywords,
      statuses: p.match.statuses,
      revisionStatuses: p.match.revisionStatuses,
    },
    transitions: {
      inProgressId: p.transitions.inProgressId,
      readyForReviewId: p.transitions.readyForReviewId,
      revisionId: p.transitions.revisionId,
    },
  }));

  const ids = new Set<string>();
  for (const p of profiles) {
    if (ids.has(p.id)) {
      throw new Error(`Duplicate profile ID: ${p.id}`);
    }
    ids.add(p.id);

    const statusSet = new Set(p.match.statuses.map((s) => s.toLowerCase()));
    const overlap = p.match.revisionStatuses.filter((s) => statusSet.has(s.toLowerCase()));
    if (overlap.length > 0) {
      throw new Error(
        `Profile "${p.id}": statuses and revisionStatuses must not overlap — found in both: ${overlap.join(", ")}`
      );
    }
  }

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
