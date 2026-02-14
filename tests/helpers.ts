/**
 * Shared test factories and helpers.
 *
 * Import from here instead of duplicating `makeIssue`, `makeProfile`, `makeConfig`
 * across individual test files.
 */

import type { AppConfig, AgentProfile, DashboardConfig } from "../src/config.js";
import type { JiraIssue } from "../src/jira/types.js";

/** Create a minimal JiraIssue for testing. */
export function makeIssue(
  key: string,
  summary = `Test issue ${key}`,
  status = "New",
): JiraIssue {
  return {
    key,
    fields: { summary, status: { name: status }, created: "2026-01-01T00:00:00.000+0000" },
  };
}

/** Create a minimal AgentProfile for testing. */
export function makeProfile(
  overrides: Partial<AgentProfile> = {},
): AgentProfile {
  return {
    id: "ralph-default",
    repoPath: "/tmp/test-repo",
    composeFile: ".ralph/docker-compose.yml",
    agentName: "ralph",
    timeoutMs: 1800000,
    match: { projects: ["DF"], keywords: [], statuses: [], revisionStatuses: [] },
    transitions: { inProgressId: "141", readyForReviewId: "91" },
    ...overrides,
  };
}

/** Create a minimal AppConfig for testing. */
export function makeConfig(profiles?: AgentProfile[]): AppConfig {
  return {
    jira: {
      baseUrl: "https://api.atlassian.com/ex/jira",
      cloudId: "test-cloud-id",
      jql: ["project = DF"],
      pollIntervalMs: 60000,
    },
    profiles: profiles ?? [makeProfile()],
    output: {
      logDir: "/tmp/test-output/logs",
      handoffDir: "/tmp/test-output/handoffs",
    },
    dashboard: {
      enabled: false,
      url: "",
      secret: "",
      intervalMs: 30000,
    },
    secrets: {
      ghToken: "test-gh-token",
      adoPatDocs: "test-ado-pat",
      adoPatXperience: "test-ado-xp-pat",
      jiraPat: "test-jira-pat",
      jiraEmail: "test@test.com",
    },
  };
}
