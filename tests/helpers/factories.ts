/**
 * Data factories for test fixtures.
 *
 * Pure constructors — no vi.fn() or mock behavior. Build value objects
 * with sensible defaults and optional overrides.
 */

import type { IAppConfig, IAgentProfile, IJiraConfig, IProfileMatch } from "../../src/config/types.js";
import { CliType, TaskStatus } from "../../src/container/types.js";
import type { RalphResult } from "../../src/container/types.js";
import type { JiraIssue, JiraComment } from "../../src/jira/types.js";
import type { WorkItem, WorkItemComment } from "../../src/datasource/types.js";
import type { CompletedTask } from "../../src/orchestrator-types.js";
import type { TemplateContext } from "../../src/container/setup/agent-includes.js";
import type { TaskContext } from "../../src/services/task-context.js";
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
  body: unknown,
  created = "2026-01-01T00:00:00Z",
  accountId = "test-account-id",
): JiraComment {
  return { id, author: { accountId, displayName: "Test User" }, body, created };
}

// ── Work item data (generic) ─────────────────────────────────────────────────

/** Create a minimal WorkItem with sensible defaults. */
export function makeWorkItem(
  id: string,
  summaryOrOverrides: string | Partial<WorkItem> = {},
  status = "New",
  updated?: string,
): WorkItem {
  const overrides = typeof summaryOrOverrides === "string"
    ? { title: summaryOrOverrides, status, ...(updated !== undefined ? { updated } : {}) }
    : summaryOrOverrides;
  return {
    id,
    source: "jira",
    project: id.split("-")[0] ?? "DF",
    title: `Test work item ${id}`,
    description: "",
    status: "New",
    type: "",
    priority: "",
    labels: [],
    components: [],
    created: "2026-01-01T00:00:00.000+0000",
    updated: "",
    customFields: new Map<string, string>(),
    sourceData: null,
    ...overrides,
  };
}

/** Create a minimal WorkItemComment. */
export function makeWorkItemComment(
  id: string,
  body: string,
  createdOrOverrides: string | Partial<WorkItemComment> = {},
  accountId = "test-account-id",
): WorkItemComment {
  const overrides = typeof createdOrOverrides === "string"
    ? { created: createdOrOverrides, authorId: accountId }
    : createdOrOverrides;
  return {
    id,
    authorName: "Test User",
    authorId: "test-account-id",
    body,
    created: "2026-01-01T00:00:00Z",
    ...overrides,
  };
}

// ── Container data ───────────────────────────────────────────────────────────

/** Create a mock RalphResult with sensible defaults. */
export function makeResult(
  taskId: string,
  overrides: Partial<RalphResult> = {},
): RalphResult {
  return {
    taskId,
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

/** Create a minimal IJiraConfig with sensible defaults. */
export function makeJiraConfig(overrides: Partial<IJiraConfig> = {}): IJiraConfig {
  return {
    baseUrl: "https://api.atlassian.com/ex/jira",
    cloudId: "test-cloud-id",
    jql: ["project = DF"],
    pollIntervalMs: 60000,
    ...overrides,
  };
}

/** Create a IProfileMatch with sensible defaults. Only `commentTrigger` is typically needed. */
export function makeMatch(overrides: Partial<IProfileMatch> & Pick<IProfileMatch, "commentTrigger">): IProfileMatch {
  return {
    projects: ["DF"],
    statuses: [],
    revisionStatuses: [],
    ...overrides,
  };
}

/** Create a minimal IAgentProfile for testing. */
export function makeProfile(
  overrides: Partial<Omit<IAgentProfile, "match">> & { match?: Partial<IProfileMatch> } = {},
): IAgentProfile {
  const id = overrides.id ?? "ralph-default";
  const agentName = overrides.agentName ?? "ralph";
  const match: IProfileMatch = {
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
    maxContinuations: 0,
    mcpServers: [],
    mcpServerConfigs: {},
    githubMcpTools: false,
    skills: [],
    ...overrides,
    match,
    // Re-derive variantKey after overrides are applied
    ...(overrides.variantKey ? {} : {
      variantKey: `${overrides.id ?? id}:${overrides.agentName ?? agentName}:${match.commentTrigger}`,
    }),
  };
}

/** Create a minimal IAppConfig for testing. */
export function makeConfig(profiles?: IAgentProfile[]): IAppConfig {
  return {
    jira: makeJiraConfig(),
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
    enableContinuation: false,
    excludeFields: [],
    allowedUsers: [],
    ralphchives: {
      enabled: false,
      nodebbApiUrl: "http://localhost:4567",
      neo4jUri: "bolt://localhost:7687",
      neo4jUser: "neo4j",
    },
    secrets: {
      ghToken: "test-gh-token",
      adoPat: "test-ado-pat",
      adoPatXperience: "test-ado-xp-pat",
      jiraPat: "test-jira-pat",
      jiraEmail: "test@test.com",
      anthropicApiKey: "",
      discordBotToken: "",
      discordChannelId: "",
    },
  };
}

// ── Orchestrator data ────────────────────────────────────────────────────────

/** Create a minimal CompletedTask for testing. */
export function makeCompletion(
  key: string,
  overrides: Partial<CompletedTask> = {},
): CompletedTask {
  return {
    key,
    summary: `Test issue ${key}`,
    profileId: "ralph-docs",
    status: TaskStatus.Completed,
    durationMs: 5000,
    completedAt: Date.now(),
    ...overrides,
  };
}

// ── Template context ─────────────────────────────────────────────────────────

/** Create a minimal TemplateContext for testing. */
export function makeTemplateContext(overrides: Partial<TemplateContext> = {}): TemplateContext {
  return {
    profileId: "ralph-default",
    repo: "/tmp/test-repo",
    cli: "copilot",
    model: "",
    agentName: "ralph",
    displayName: "ralph",
    mcpServers: [],
    taskId: "DF-100",
    taskTitle: "Test issue DF-100",
    taskStatus: "New",
    taskType: "",
    taskPriority: "",
    taskLabels: [],
    taskComponents: [],
    taskProject: "DF",
    taskDescription: "",
    taskCreated: "2026-01-01T00:00:00.000+0000",
    taskUpdated: "",
    commentTrigger: "@ralph",
    triggerParams: {},
    isRevision: false,
    ralphchivesEnabled: false,
    skills: [],
    ...overrides,
  };
}

// ── Task context ─────────────────────────────────────────────────────────────

/** Create a minimal TaskContext for testing. */
export function makeTaskContext(overrides: Partial<TaskContext> = {}): TaskContext {
  return {
    workItem: makeWorkItem("DF-100"),
    profile: makeProfile(),
    taskId: "DF-100-1234567890000",
    triggerParams: {},
    isRevision: false,
    ralphchivesEnabled: false,
    ...overrides,
  };
}
