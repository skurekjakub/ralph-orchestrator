/**
 * Data factories for test fixtures.
 *
 * Pure constructors — no vi.fn() or mock behavior. Build value objects
 * with sensible defaults and optional overrides.
 */

import {
  ClaudeAuthMode,
  CliType,
  StageMode,
  type IAppConfig,
  type IAgentProfile,
  type IDataSourceConfig,
  type IProfileMatch,
  type IStageConfig,
  VcsProvider,
} from "../../src/config/types";
import { TaskStatus, type ContainerExecResult, type RalphResult } from "../../src/container/types";
import type { JiraIssue, JiraComment } from "../../src/datasource/connectors/jira/jira-types";
import type { WorkItem, WorkItemComment } from "../../src/datasource/types";
import type { CompletedTask } from "../../src/orchestrator-types";
import type { TemplateContext } from "../../src/container/setup/agent-includes";
import type { TaskContext } from "../../src/services/task-context";
import { AuditMode } from "../../src/prompt/prompt-auditor";
import { slugifyBranchName } from "../../src/util/branch";
import { createCliRuntimeRegistry } from "../../src/cli/supported-runtimes";
import { agentFrontmatterSchema, type AgentSource } from "../../src/cli/agent-definition";
import type { AgentDefinition } from "../../src/cli/agent-file-writer";

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
  const overrides =
    typeof summaryOrOverrides === "string"
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
  const overrides =
    typeof createdOrOverrides === "string" ? { created: createdOrOverrides, authorId: accountId } : createdOrOverrides;
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

/** Create the result of a CLI process that exited cleanly without output. */
export function makeExecResult(overrides: Partial<ContainerExecResult> = {}): ContainerExecResult {
  return { exitCode: 0, stdout: "", stderr: "", timedOut: false, agentText: "", ...overrides };
}

/** Create a mock RalphResult with sensible defaults. */
export function makeResult(taskId: string, overrides: Partial<RalphResult> = {}): RalphResult {
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

/** Create a minimal data source config for testing. */
export function makeDataSourceConfig(overrides: Partial<IDataSourceConfig> = {}): IDataSourceConfig {
  return {
    type: "jira",
    connection: {
      baseUrl: "https://api.atlassian.com/ex/jira",
      cloudId: "test-cloud-id",
      excludeFields: [],
      allowedUsers: [],
      email: "test@test.com",
      apiToken: "test-jira-pat",
    },
    pollIntervalMs: 60000,
    maxResults: 100,
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

/** Create a resolved IStageConfig: a Copilot container stage that requires a result block. */
export function makeStage(overrides: Partial<IStageConfig> = {}): IStageConfig {
  return {
    agent: "ralph",
    role: "primary",
    mode: StageMode.Container,
    cli: CliType.Copilot,
    skills: [],
    requireResultBlock: true,
    ...overrides,
  };
}

/** Create a minimal IAgentProfile for testing. `containerClis` follows the stages unless overridden. */
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
  const stages = overrides.stages ?? [makeStage({ agent: agentName })];
  return {
    id,
    repoPath: "/tmp/test-repo",
    composeFile: "profiles/ralph-default/docker-compose.yml",
    agentName,
    displayName: agentName.replace(/^ralph\./, ""),
    variantKey: `${id}:${agentName}:${match.commentTrigger}`,
    cli: CliType.Copilot,
    containerClis: [...new Set(stages.filter((s) => s.mode === StageMode.Container).map((s) => s.cli))],
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
    mcpSidecarEnv: {},
    githubMcpTools: false,
    claude: { loadRepoInstructions: false },
    allowlistDomains: [],
    skills: overrides.skills ?? stages.flatMap((s) => s.skills ?? []),
    stages,
    postTaskHooks: [],
    dataSource: "test-source",
    vcsProvider: VcsProvider.Ado,
    repoPat: "ADO_PAT",
    ...overrides,
    match,
    // Re-derive variantKey after overrides are applied
    ...(overrides.variantKey
      ? {}
      : {
          variantKey: `${overrides.id ?? id}:${overrides.agentName ?? agentName}:${match.commentTrigger}`,
        }),
  };
}

/** Create a minimal IAppConfig for testing. */
export function makeConfig(profiles?: IAgentProfile[]): IAppConfig {
  return {
    dataSources: { "test-source": makeDataSourceConfig() },
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
    claudeAuth: ClaudeAuthMode.OAuthToken,
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
      anthropicApiKey: "",
      claudeCodeOauthToken: "",
      discordBotToken: "",
      discordChannelId: "",
    },
  };
}

// ── Orchestrator data ────────────────────────────────────────────────────────

/** Create a minimal CompletedTask for testing. */
export function makeCompletion(key: string, overrides: Partial<CompletedTask> = {}): CompletedTask {
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
  const cli = overrides.cli ?? CliType.Copilot;
  return {
    profileId: "ralph-default",
    repo: "/tmp/test-repo",
    targetRepoPath: "/tmp/test-repo",
    cli,
    cliTools: createCliRuntimeRegistry(ClaudeAuthMode.OAuthToken).get(cli).toolNames,
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
    prUrl: "",
    ralphchivesEnabled: false,
    skills: [],
    artifactDir: `.ralph/tasks/${overrides.taskId ?? "DF-100"}/artifacts`,
    stageRole: "primary",
    stageMode: "container",
    stageIndex: 0,
    stageCount: 1,
    isFirstStage: true,
    isLastStage: true,
    previousStageRoles: [],
    hook: {
      taskOutputDir: "",
      collectedLogs: {},
      name: "",
      outputDir: "",
    },
    ...overrides,
  };
}

// ── Agent templates ──────────────────────────────────────────────────────────

/** Frontmatter fields of {@link makeAgentTemplate}; arrays are written as flow sequences. */
export interface AgentTemplateFields {
  readonly description?: string;
  readonly model?: string;
  readonly subagents?: readonly string[];
  readonly runtimes?: readonly string[];
  readonly skills?: readonly string[];
  /** Extra raw frontmatter lines, written verbatim after the fields above. */
  readonly extraLines?: readonly string[];
  readonly body?: string;
}

/** The text of a canonical `*.agent.md` template named `name`. */
export function makeAgentTemplate(name: string, fields: AgentTemplateFields = {}): string {
  const lines = [`name: ${name}`, `description: '${fields.description ?? `The ${name} agent`}'`];
  if (fields.model !== undefined) lines.push(`model: ${fields.model}`);
  if (fields.subagents) lines.push(`subagents: [${fields.subagents.join(", ")}]`);
  if (fields.runtimes) lines.push(`runtimes: [${fields.runtimes.join(", ")}]`);
  if (fields.skills) lines.push(`skills: [${fields.skills.join(", ")}]`);
  lines.push(...(fields.extraLines ?? []));
  return `---\n${lines.join("\n")}\n---\n${fields.body ?? `Body of ${name}.\n`}`;
}

/** A parsed {@link AgentSource}; `frontmatter` is schema-defaulted from the given fields. */
export function makeAgentSource(
  fileId: string,
  frontmatter: Partial<AgentSource["frontmatter"]> & { name: string },
  bodyTemplate = "Body.\n",
): AgentSource {
  return {
    fileId,
    frontmatter: agentFrontmatterSchema.parse({ description: `The ${frontmatter.name} agent`, ...frontmatter }),
    bodyTemplate,
  };
}

/** A rendered {@link AgentDefinition} with file id `ralph.<name>`; `frontmatter` is schema-defaulted. */
export function makeAgentDefinition(
  frontmatter: Partial<AgentSource["frontmatter"]> & { name: string },
  body = "\nBody.\n",
): AgentDefinition {
  const { fileId, frontmatter: parsed } = makeAgentSource(`ralph.${frontmatter.name}`, frontmatter);
  return { ...parsed, fileId, body };
}

// ── Task context ─────────────────────────────────────────────────────────────

/** Create a minimal TaskContext for testing. */
export function makeTaskContext(overrides: Partial<TaskContext> = {}): TaskContext {
  const workItem = overrides.workItem ?? makeWorkItem("DF-100");
  const triggerParams = overrides.triggerParams ?? {};

  return {
    workItem,
    profile: overrides.profile ?? makeProfile(),
    taskId: "DF-100-1234567890000",
    triggerParams,
    sourceBranch: overrides.sourceBranch ?? triggerParams.source_branch ?? "main",
    taskBranch: overrides.taskBranch ?? triggerParams.branch ?? slugifyBranchName(workItem.id, workItem.title),
    isRevision: false,
    ralphchivesEnabled: false,
    prUrl: null,
    outputDir: "",
    signal: new AbortController().signal,
    onToolOutput: undefined,
    onPreToolUse: undefined,
    ...overrides,
  };
}
