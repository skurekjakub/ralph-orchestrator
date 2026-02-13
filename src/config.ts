import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import "dotenv/config";

export interface JiraConfig {
  baseUrl: string;
  cloudId: string;
  project: string;
  jql: string;
  pollIntervalMs: number;
  inProgressTransitionId: string;
}

export interface RalphConfig {
  repoPath: string;
  devcontainerConfig: string;
  agentName: string;
  timeoutMs: number;
}

export interface OutputConfig {
  logDir: string;
  handoffDir: string;
}

export interface AppConfig {
  jira: JiraConfig;
  ralph: RalphConfig;
  output: OutputConfig;
  secrets: {
    ghToken: string;
    adoPatDocs: string;
    adoPatXperience: string;
    jiraPat: string;
    jiraEmail: string;
  };
}

export function loadConfig(): AppConfig {
  const configPath = resolve(process.cwd(), "config.json");
  const raw = JSON.parse(readFileSync(configPath, "utf-8"));

  const repoPath = process.env.RALPH_REPO_PATH;
  if (!repoPath) {
    throw new Error("RALPH_REPO_PATH must be set in .env");
  }

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
    },
    ralph: {
      repoPath,
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
