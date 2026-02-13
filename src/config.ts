import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import "dotenv/config";

/** JIRA Cloud connection and polling settings. */
export interface JiraConfig {
  /** Base URL for the Atlassian Cloud JIRA REST API (e.g. `https://api.atlassian.com/ex/jira`). */
  baseUrl: string;
  /** JIRA Cloud instance ID (the UUID after `/ex/jira/` in API URLs). */
  cloudId: string;
  /** JIRA project key (e.g. `DF`). */
  project: string;
  /** One or more JQL queries to poll for issues. Results are deduplicated by key. */
  jql: string[];
  /** Polling interval in milliseconds. Defaults to 60 000 (1 minute). */
  pollIntervalMs: number;
  /** JIRA transition ID to move an issue to "In Progress". */
  inProgressTransitionId: string;
  /** JIRA transition ID to move an issue to "Ready for Review" after completion. */
  readyForReviewTransitionId: string;
}

/** Ralph devcontainer and agent execution settings. */
export interface RalphConfig {
  /** Absolute path to the local clone of the kentico-docs-jekyll repository. */
  repoPath: string;
  /** Relative path from repoPath to the devcontainer.json (e.g. `.ralph/devcontainer.json`). */
  devcontainerConfig: string;
  /** Name of the Copilot CLI agent to invoke (e.g. `ralph`). */
  agentName: string;
  /** Maximum time in milliseconds to wait for a single Ralph execution. Defaults to 1 800 000 (30 min). */
  timeoutMs: number;
}

/** Filesystem paths for orchestrator output. */
export interface OutputConfig {
  /** Directory for audit logs, copilot output, execution summaries, and activity logs. */
  logDir: string;
  /** Directory for handoff files (currently unused — Ralph attaches directly to JIRA). */
  handoffDir: string;
}

/** Top-level application configuration combining static config.json and .env secrets. */
export interface AppConfig {
  jira: JiraConfig;
  ralph: RalphConfig;
  output: OutputConfig;
  /** Sensitive credentials loaded from environment variables. */
  secrets: {
    /** GitHub PAT with "Copilot Requests" permission for the Copilot CLI. */
    ghToken: string;
    /** Azure DevOps PAT for the docs repo (KenticoCustomerSuccess org). */
    adoPatDocs: string;
    /** Azure DevOps PAT for the Xperience repo (kenticoxperience org). Optional. */
    adoPatXperience: string;
    /** JIRA API token from id.atlassian.com. */
    jiraPat: string;
    /** Email address associated with the JIRA API token. */
    jiraEmail: string;
  };
}

/**
 * Load and validate configuration from `config.json` (static settings) and `.env` (secrets).
 *
 * Strips surrounding quotes from RALPH_REPO_PATH and expands `~` to the home directory.
 * Throws if any required environment variable is missing.
 *
 * @returns Fully resolved {@link AppConfig} ready for use by the Orchestrator.
 */
export function loadConfig(): AppConfig {
  const configPath = resolve(process.cwd(), "config.json");
  const raw = JSON.parse(readFileSync(configPath, "utf-8"));

  const repoPath = process.env.RALPH_REPO_PATH;
  if (!repoPath) {
    throw new Error("RALPH_REPO_PATH must be set in .env");
  }

  // Strip surrounding quotes (dotenv doesn't remove them) and expand ~ to home dir
  const cleanPath = repoPath.replace(/^["']|["']$/g, "");
  const resolvedRepoPath = cleanPath.startsWith("~/")
    ? resolve(process.env.HOME ?? "/root", cleanPath.slice(2))
    : resolve(cleanPath);

  const jiraPat = process.env.JIRA_PAT;
  const jiraEmail = process.env.JIRA_EMAIL;
  if (!jiraPat || !jiraEmail) {
    throw new Error("JIRA_PAT and JIRA_EMAIL must be set in .env");
  }

  const ghToken = process.env.GH_TOKEN;
  const adoPatDocs = process.env.ADO_PAT_DOCS;
  const adoPatXperience = process.env.ADO_PAT_XPERIENCE;
  if (!ghToken || !adoPatDocs) {
    throw new Error("GH_TOKEN and ADO_PAT_DOCS must be set in .env");
  }

  return {
    jira: {
      baseUrl: raw.jira.baseUrl,
      cloudId: raw.jira.cloudId,
      project: raw.jira.project,
      jql: raw.jira.jql,
      pollIntervalMs: raw.jira.pollIntervalMs ?? 60_000,
      inProgressTransitionId: raw.jira.inProgressTransitionId,
      readyForReviewTransitionId: raw.jira.readyForReviewTransitionId,
    },
    ralph: {
      repoPath: resolvedRepoPath,
      devcontainerConfig: raw.ralph.devcontainerConfig,
      agentName: raw.ralph.agentName ?? "ralph",
      timeoutMs: raw.ralph.timeoutMs ?? 1_800_000,
    },
    output: {
      logDir: resolve(process.cwd(), raw.output.logDir ?? "./output/logs"),
      handoffDir: resolve(
        process.cwd(),
        raw.output.handoffDir ?? "./output/handoffs"
      ),
    },
    secrets: {
      ghToken,
      adoPatDocs,
      adoPatXperience: adoPatXperience ?? "",
      jiraPat,
      jiraEmail,
    },
  };
}
