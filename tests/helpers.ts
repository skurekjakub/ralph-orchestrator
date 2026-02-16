/**
 * Shared test factories and helpers.
 *
 * Import from here instead of duplicating `makeIssue`, `makeProfile`, `makeConfig`
 * across individual test files.
 */

import type { AppConfig, AgentProfile, ProfileMatch } from "../src/config.js";
import type { JiraIssue } from "../src/jira/types.js";

/** Create a ProfileMatch with sensible defaults. Only `commentTrigger` is typically needed. */
export function makeMatch(overrides: Partial<ProfileMatch> & Pick<ProfileMatch, "commentTrigger">): ProfileMatch {
  return {
    projects: ["DF"],
    statuses: [],
    revisionStatuses: [],
    ...overrides,
  };
}

/** Create a minimal JiraIssue for testing. */
export function makeIssue(
  key: string,
  summary = `Test issue ${key}`,
  status = "New",
  updated?: string,
): JiraIssue {
  return {
    key,
    fields: {
      summary,
      status: { name: status },
      created: "2026-01-01T00:00:00.000+0000",
      ...(updated !== undefined ? { updated } : {}),
    },
  };
}

/** Create a minimal AgentProfile for testing. */
export function makeProfile(
  overrides: Partial<AgentProfile> = {},
): AgentProfile {
  const id = overrides.id ?? "ralph-default";
  const agentName = overrides.agentName ?? "ralph";
  const match = overrides.match ?? { projects: ["DF"], statuses: [], commentTrigger: "@ralph", revisionStatuses: [] };
  return {
    id,
    repoPath: "/tmp/test-repo",
    composeFile: "profiles/ralph-default/docker-compose.yml",
    agentName,
    displayName: agentName.replace(/^ralph\./, ""),
    variantKey: `${id}:${agentName}:${match.commentTrigger}`,
    cli: "copilot" as const,
    timeoutMs: 1800000,
    setupScript: "/usr/local/bin/setup.sh",
    auditLogPath: "/workspace/.ralph/logs/audit.jsonl",
    composeProjectLabel: "ralph-sandbox",
    match,
    beforeAgent: {},
    afterAgent: {},
    ...overrides,
    // Re-derive variantKey after overrides are applied
    ...(overrides.variantKey ? {} : {
      variantKey: `${overrides.id ?? id}:${overrides.agentName ?? agentName}:${(overrides.match ?? match).commentTrigger}`,
    }),
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
      anthropicApiKey: "",
    },
  };
}
