/**
 * Data factories for test fixtures.
 *
 * Pure constructors — no vi.fn() or mock behavior. Build value objects
 * with sensible defaults and optional overrides.
 */

import type { AppConfig, AgentProfile, ProfileMatch } from "../../src/config.js";
import { CliType, TaskStatus } from "../../src/container/types.js";
import type { RalphResult } from "../../src/container/types.js";
import type { JiraIssue, JiraComment } from "../../src/jira/types.js";
import { AuditMode } from "../../src/prompt/prompt-auditor.js";

// ── JIRA data ────────────────────────────────────────────────────────────────

/** Create a minimal JiraIssue. Accepts either positional args or an `extraFields` spread. */
export function makeIssue(
  key: string,
  summary = `Test issue ${key}`,
  status = "New",
  updated?: string,
  extraFields?: Record<string, unknown>,
): JiraIssue {
  return {
    key,
    fields: {
      summary,
      status: { name: status },
      created: "2026-01-01T00:00:00.000+0000",
      ...(updated !== undefined ? { updated } : {}),
      ...extraFields,
    },
  };
}

/** Create a minimal JiraComment. */
export function makeComment(
  id: string,
  body: string,
  created = "2026-01-01T00:00:00Z",
): JiraComment {
  return { id, author: { displayName: "Test User" }, body, created };
}

// ── Container data ───────────────────────────────────────────────────────────

/** Create a mock RalphResult with sensible defaults. */
export function makeResult(
  issueKey: string,
  overrides: Partial<RalphResult> = {},
): RalphResult {
  return {
    issueKey,
    status: TaskStatus.Completed,
    durationMs: 5000,
    exitCode: 0,
    stdout: "Done",
    stderr: "",
    collectedLogs: {},
    ...overrides,
  };
}

// ── Profile / Config ─────────────────────────────────────────────────────────

/** Create a ProfileMatch with sensible defaults. Only `commentTrigger` is typically needed. */
export function makeMatch(overrides: Partial<ProfileMatch> & Pick<ProfileMatch, "commentTrigger">): ProfileMatch {
  return {
    projects: ["DF"],
    statuses: [],
    revisionStatuses: [],
    ...overrides,
  };
}

/** Create a minimal AgentProfile for testing. */
export function makeProfile(
  overrides: Partial<Omit<AgentProfile, "match">> & { match?: Partial<ProfileMatch> } = {},
): AgentProfile {
  const id = overrides.id ?? "ralph-default";
  const agentName = overrides.agentName ?? "ralph";
  const match: ProfileMatch = {
    projects: ["DF"],
    statuses: [],
    commentTrigger: "@ralph",
    revisionStatuses: [],
    ...overrides.match,
  };
  return {
    id,
    repoPath: "/tmp/test-repo",
    composeFile: "profiles/ralph-default/docker-compose.yml",
    agentName,
    displayName: agentName.replace(/^ralph\./, ""),
    variantKey: `${id}:${agentName}:${match.commentTrigger}`,
    cli: CliType.Copilot,
    timeoutMs: 1800000,
    setupScript: "/usr/local/bin/setup.sh",
    auditLogPath: "/workspace/.ralph/logs/audit.jsonl",
    composeProjectLabel: "ralph-sandbox",
    beforeAgent: {},
    afterAgent: {},
    cleanPaths: [],
    mcpServers: [],
    ...overrides,
    match,
    // Re-derive variantKey after overrides are applied
    ...(overrides.variantKey ? {} : {
      variantKey: `${overrides.id ?? id}:${overrides.agentName ?? agentName}:${match.commentTrigger}`,
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
    promptAudit: {
      mode: AuditMode.Warn,
    },
    excludeFields: [],
    secrets: {
      ghToken: "test-gh-token",
      adoPatDocs: "test-ado-pat",
      adoPatXperience: "test-ado-xp-pat",
      jiraPat: "test-jira-pat",
      jiraEmail: "test@test.com",
      anthropicApiKey: "",
      discordBotToken: "",
      discordChannelId: "",
    },
  };
}
