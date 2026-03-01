/**
 * Service mock factories for testing.
 *
 * All mocks use `vi.fn()` and return typed `Mocked<Interface>` objects.
 * Accept optional overrides to customize individual method implementations.
 */

import { vi, type Mock } from "vitest";
import type { Logger } from "../../src/logger.js";
import type { IJiraClient } from "../../src/datasource/connectors/jira/jira-client.js";
import type { IIssueManager } from "../../src/services/issue-manager.js";
import type { IResourceManager } from "../../src/services/task-resource-manager.js";
import type { IComposeClient } from "../../src/container/compose-client.js";
import type { IContainerManager } from "../../src/container/manager.js";
import type { IDataSourceConnector, IDataSourceIdentity, ISupportsAttachments, ISupportsTransitions } from "../../src/datasource/connector.js";
import type { ILogCollector } from "../../src/logs/collector.js";
import type { IWorkItemPoller } from "../../src/datasource/poller.js";
import type { ITaskRunner } from "../../src/services/task-runner.js";
import type { IAgentTemplateRenderer } from "../../src/container/setup/agent-includes.js";
import type { ISkillTemplateRenderer } from "../../src/container/setup/skill-includes.js";
import type { IJitMcpConfigWriter } from "../../src/container/setup/jit-mcp-params.js";
import type { ITaskResultWriter } from "../../src/services/task-result-writer.js";
import type { AppStartupDeps } from "../../src/app-startup.js";
import type { RalphResult, CliPaths } from "../../src/container/types.js";
import type { ResultPromise } from "execa";
import { makeConfig, makeResult } from "./factories.js";

// ── Mocked<T> utility type ──────────────────────────────────────────────────

/**
 * Maps every public method on `T` to a `Mock` spy, preserving the original signature.
 * Non-function and optional properties are excluded.
 *
 * Use the concrete `Mocked<T>` return type for assertions (autocomplete, type-safe call checks).
 */
export type Mocked<T> = {
  [K in keyof T as T[K] extends (...args: any[]) => any ? K : never]:
    T[K] extends (...args: infer A) => infer R ? Mock<(...args: A) => R> : never;
};

// ── Logger ───────────────────────────────────────────────────────────────────

/** Create a Logger that discards all output (no spy tracking). */
export function createSilentLogger(): Logger {
  return { info: () => {}, warn: () => {}, error: () => {} };
}

/** Create a Logger backed by `vi.fn()` spies for assertion. */
export function createMockLogger(): Logger {
  return { info: vi.fn(), warn: vi.fn(), error: vi.fn() };
}

// ── Execa helpers ────────────────────────────────────────────────────────────

/**
 * Minimal shape satisfying the awaited value of execa `ResultPromise`.
 *
 * Centralizes the `as any` cast so test files can use a typed helper
 * instead of scattering `as any` across individual mock setups.
 */
export function fakeExecResult(overrides: Record<string, unknown> = {}): Awaited<ResultPromise> {
  return { stdout: "", stderr: "", exitCode: 0, ...overrides } as Awaited<ResultPromise>;
}

// ── JIRA service mocks ───────────────────────────────────────────────────────

/**
 * Create a mock JiraClient with all methods stubbed via `vi.fn()`.
 *
 * Provide `overrides` to customize individual method implementations:
 * ```ts
 * const jira = createMockJiraClient({
 *   getComments: vi.fn().mockResolvedValue([makeComment("1", "text")]),
 * });
 * ```
 */
export function createMockJiraClient(overrides: Partial<Mocked<IJiraClient>> = {}): Mocked<IJiraClient> {
  return {
    searchIssues: vi.fn().mockResolvedValue([]),
    addComment: vi.fn().mockResolvedValue(undefined),
    getComments: vi.fn().mockResolvedValue([]),
    transitionIssue: vi.fn().mockResolvedValue(undefined),
    getTransitions: vi.fn().mockResolvedValue([]),
    findTransitionId: vi.fn().mockResolvedValue("99"),
    getAttachments: vi.fn().mockResolvedValue([]),
    downloadAttachment: vi.fn().mockResolvedValue(""),
    addAttachment: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  } as Mocked<IJiraClient>;
}

/** Create a mock IssueManager with all methods stubbed. */
export function createMockIssueManager(overrides: Partial<Mocked<IIssueManager>> = {}): Mocked<IIssueManager> {
  return {
    getComments: vi.fn().mockResolvedValue([]),
    postAckComment: vi.fn().mockResolvedValue(undefined),
    refreshWorkItem: vi.fn().mockResolvedValue(null),
    transitionWorkItem: vi.fn().mockResolvedValue(undefined),
    postStartComment: vi.fn().mockResolvedValue(undefined),
    postErrorComment: vi.fn().mockResolvedValue(undefined),
    postCrashRecoveryComment: vi.fn().mockResolvedValue(undefined),
    postStaleStatusComment: vi.fn().mockResolvedValue(undefined),
    postComment: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  } as Mocked<IIssueManager>;
}

/** Create a mock TaskResourceManager with all methods stubbed. */
export function createMockResources(overrides: Partial<Mocked<IResourceManager>> = {}): Mocked<IResourceManager> {
  return {
    fetchHandoff: vi.fn().mockResolvedValue(null),
    fetchComments: vi.fn().mockResolvedValue([]),
    attachTranscript: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  } as Mocked<IResourceManager>;
}

/** Create a mock IDataSourceConnector with all capabilities (transitions + attachments). */
export function createMockConnector(
  overrides: Partial<IDataSourceIdentity & Mocked<IDataSourceConnector & ISupportsTransitions & ISupportsAttachments>> = {},
): IDataSourceIdentity & Mocked<IDataSourceConnector & ISupportsTransitions & ISupportsAttachments> {
  return {
    name: "MockConnector",
    sourceKey: "mock",
    getAllowedUsers: vi.fn().mockReturnValue([]),
    buildQueries: vi.fn().mockReturnValue([]),
    searchWorkItems: vi.fn().mockResolvedValue([]),
    refreshWorkItem: vi.fn().mockResolvedValue(null),
    isValidItemId: vi.fn().mockReturnValue(true),
    getComments: vi.fn().mockResolvedValue([]),
    addComment: vi.fn().mockResolvedValue(undefined),
    getTransitions: vi.fn().mockResolvedValue([]),
    transitionWorkItem: vi.fn().mockResolvedValue(undefined),
    getAttachments: vi.fn().mockResolvedValue([]),
    downloadAttachment: vi.fn().mockResolvedValue(""),
    addAttachment: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  } as IDataSourceIdentity & Mocked<IDataSourceConnector & ISupportsTransitions & ISupportsAttachments>;
}

// ── Container mocks ──────────────────────────────────────────────────────────

/**
 * Create a mock ComposeClient with `exec` stubbed.
 *
 * Returns both the client and the underlying `exec` spy for assertion.
 */
export function createMockCompose(execImpl?: (...args: any[]) => any): {
  compose: IComposeClient;
  exec: ReturnType<typeof vi.fn>;
} {
  const exec = execImpl
    ? vi.fn().mockImplementation(execImpl)
    : vi.fn().mockResolvedValue({ stdout: "", stderr: "" });
  const compose: IComposeClient = {
    compose: vi.fn().mockResolvedValue({ stdout: "", stderr: "" }),
    exec,
    execWithTimeout: vi.fn().mockResolvedValue({ stdout: "", stderr: "" }),
    logs: vi.fn().mockResolvedValue({ stdout: "", stderr: "" }),
    checkDocker: vi.fn().mockResolvedValue(undefined),
    getContainerName: vi.fn().mockResolvedValue("mock-container"),
  } as IComposeClient;
  return { compose, exec };
}

/**
 * Create a mock ContainerManager with all methods stubbed via `vi.fn()`.
 *
 * Returns both the typed container and the underlying spies for assertion:
 * ```ts
 * const { container, spies } = createMockContainer();
 * await runner.run(issue, profile);
 * expect(spies.start).toHaveBeenCalled();
 * ```
 */
export function createMockContainer(
  executeResult?: Partial<RalphResult>,
): {
  container: IContainerManager;
  spies: Record<string, ReturnType<typeof vi.fn>>;
} {
  const taskId = executeResult?.taskId ?? "MOCK-1";
  const result: RalphResult = makeResult(taskId, executeResult);

  const spies = {
    start: vi.fn().mockResolvedValue(undefined),
    checkPrerequisites: vi.fn().mockResolvedValue(undefined),
    setup: vi.fn().mockResolvedValue(undefined),
    execInApp: vi.fn().mockResolvedValue({ stdout: "", stderr: "" }),
    execInSidecar: vi.fn().mockResolvedValue({ stdout: "", stderr: "" }),
    registerLogSources: vi.fn(),
    execute: vi.fn().mockResolvedValue(result),
    stop: vi.fn().mockResolvedValue(undefined),
    cleanLogDirectory: vi.fn().mockResolvedValue(undefined),
    cleanPaths: vi.fn().mockResolvedValue(undefined),
    prepareConfigDir: vi.fn().mockResolvedValue(undefined),
    collectAll: vi.fn().mockResolvedValue([]),
    detach: vi.fn(),
  };

  const cliPaths: CliPaths = {
    configDir: "/workspace/.ralph",
    writableDirs: ["/workspace/.ralph/logs", "/workspace/.ralph/logs/cli-debug", "/workspace/.ralph/session-state"],
    transcriptPath: "/workspace/.ralph/logs/session-transcript.md",
    logDir: "/workspace/.ralph/logs/cli-debug",
  };

  const container: IContainerManager = {
    start: spies.start,
    checkPrerequisites: spies.checkPrerequisites,
    setup: spies.setup,
    execInApp: spies.execInApp,
    execInSidecar: spies.execInSidecar,
    registerLogSources: spies.registerLogSources,
    execute: spies.execute,
    stop: spies.stop,
    onToolOutput: undefined,
    onPreToolUse: undefined,
    cliPaths,
    logs: {
      collectAll: spies.collectAll,
      detach: spies.detach,
    },
    cleaner: {
      prepareConfigDir: spies.prepareConfigDir,
      cleanDirectory: spies.cleanLogDirectory,
      cleanPaths: spies.cleanPaths,
    },
  };

  return { container, spies };
}

// ── Orchestration service mocks ──────────────────────────────────────────────

/** Create a mock LogCollector with all methods stubbed. */
export function createMockLogCollector(overrides: Partial<Mocked<ILogCollector>> = {}): Mocked<ILogCollector> {
  return {
    saveExecutionSummary: vi.fn().mockReturnValue("/tmp/summary.json"),
    ...overrides,
  };
}

/** Create a mock TaskResultWriter with all methods stubbed. */
export function createMockResultWriter(overrides: Partial<Mocked<ITaskResultWriter>> = {}): Mocked<ITaskResultWriter> {
  return {
    collectLogs: vi.fn().mockResolvedValue(undefined),
    collectResults: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

/** Create a mock WorkItemPoller with all methods stubbed. */
export function createMockPoller(overrides: Partial<Mocked<IWorkItemPoller>> & { sourceKey?: string } = {}): Mocked<IWorkItemPoller> & { sourceKey: string } {
  return {
    sourceKey: overrides.sourceKey ?? "test-source",
    start: vi.fn(),
    stop: vi.fn(),
    onItems: vi.fn(),
    drain: vi.fn().mockReturnValue([]),
    ...overrides,
  } as Mocked<IWorkItemPoller> & { sourceKey: string };
}

/** Create a mock TaskRunner with all methods stubbed. */
export function createMockTaskRunner(overrides: Partial<Mocked<ITaskRunner>> = {}): Mocked<ITaskRunner> {
  return {
    run: vi.fn().mockImplementation(async (ctx: any) => ({
      result: makeResult(ctx.workItem?.id ?? ctx.key ?? "MOCK-1"),
      container: createMockContainer().container,
    })),
    teardown: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

/** Create a mock AgentTemplateRenderer with all methods stubbed. */
export function createMockTemplateRenderer(overrides: Partial<Mocked<IAgentTemplateRenderer>> = {}): Mocked<IAgentTemplateRenderer> {
  return {
    render: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

/** Create a mock SkillTemplateRenderer with all methods stubbed. */
export function createMockSkillRenderer(overrides: Partial<Mocked<ISkillTemplateRenderer>> = {}): Mocked<ISkillTemplateRenderer> {
  return {
    render: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

/** Create a mock JitMcpConfigWriter with all methods stubbed. */
export function createMockJitMcpConfigWriter(overrides: Partial<Mocked<IJitMcpConfigWriter>> = {}): Mocked<IJitMcpConfigWriter> {
  return {
    write: vi.fn(),
    ...overrides,
  };
}

/** Create a mock AppStartupDeps with all steps stubbed. */
export function createMockStartupDeps(overrides: Partial<AppStartupDeps> = {}): AppStartupDeps {
  return {
    validate: vi.fn().mockResolvedValue({ ok: true, errors: [], warnings: [] }),
    printResults: vi.fn().mockReturnValue(true),
    loadConfig: vi.fn().mockReturnValue(makeConfig()),
    loadPlugins: vi.fn().mockResolvedValue(undefined),
    buildMcpServers: vi.fn().mockResolvedValue(undefined),
    resolveMcpConfigs: vi.fn(),
    startRalphchives: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}
