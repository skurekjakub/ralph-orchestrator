/**
 * Service mock factories for testing.
 *
 * All mocks use `vi.fn()` and return typed `Mocked<Interface>` objects.
 * Accept optional overrides to customize individual method implementations.
 */

import { vi, type Mock } from "vitest";
import type { Logger } from "../../src/logger";
import type { IJiraClient } from "../../src/datasource/connectors/jira/jira-client";
import type { IIssueManager } from "../../src/services/issue-manager";
import type { IResourceManager } from "../../src/services/task-resource-manager";
import type { IComposeClient } from "../../src/container/compose-client";
import type { IContainerManager } from "../../src/container/manager";
import type {
  IDataSourceConnector,
  IDataSourceIdentity,
  ISupportsAttachments,
  ISupportsTransitions,
} from "../../src/datasource/connector";
import type { ILogCollector } from "../../src/logs/collector";
import type { ITextRedactor } from "../../src/logs/text-redactor";
import type { IWorkItemPoller } from "../../src/datasource/poller";
import type { ITaskRunner } from "../../src/services/task-runner";
import type { IAgentTemplateRenderer } from "../../src/container/setup/agent-includes";
import type { IComposeOverlayWriter } from "../../src/container/setup/compose-overlay-writer";
import type { IProfileSetupService } from "../../src/services/profile-setup-service";
import type { IAgentPipelineExecutor } from "../../src/services/agent-pipeline-executor";
import type { IPostTaskHookRunner } from "../../src/services/post-task-hook-runner";
import type { IStageWorkspaceResolver } from "../../src/services/stage-workspace";
import type { TaskContext } from "../../src/services/task-context";
import type { ITaskResultWriter } from "../../src/services/task-result-writer";
import type { IVcsSourceClient } from "../../src/services/vcs-source-client";
import type { ITaskWorkspaceManager } from "../../src/services/task-workspace-manager";
import type { AppStartupDeps } from "../../src/app-startup";
import type { RalphResult } from "../../src/container/types";
import type { ICliExecutor, IStageExecutorFactory } from "../../src/container/cli-executor-factory";
import type { IAgentSessionRunner } from "../../src/container/agent-session-runner";
import { CliType, StageMode, type IStageConfig } from "../../src/config/types";
import { COPILOT_CONTAINER_LAYOUT } from "../../src/cli/copilot/copilot-layout";
import { CliDebugLogKind, type ICliRuntime } from "../../src/cli/cli-runtime";
import { modelPolicyFor } from "../../src/cli/model-catalog";
import { PlainTextDecoder } from "../../src/cli/plain-text-decoder";
import type { ResultPromise, execa } from "execa";
import { once } from "node:events";
import { PassThrough } from "node:stream";
import { makeConfig, makeContainerWorkspace, makeExecResult, makeHostWorkspace, makeResult } from "./factories";

// ── Mocked<T> utility type ──────────────────────────────────────────────────

/**
 * Maps every public method on `T` to a `Mock` spy, preserving the original signature.
 * Non-function and optional properties are excluded.
 *
 * Use the concrete `Mocked<T>` return type for assertions (autocomplete, type-safe call checks).
 */
export type Mocked<T> = {
  [K in keyof T as T[K] extends (...args: any[]) => any ? K : never]: T[K] extends (...args: infer A) => infer R
    ? Mock<(...args: A) => R>
    : never;
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

/** Create a mock VcsSourceClient with all methods stubbed. */
export function createMockVcsSourceClient(overrides: Partial<Mocked<IVcsSourceClient>> = {}): Mocked<IVcsSourceClient> {
  return {
    resolvePullRequestBranches: vi.fn().mockResolvedValue(null),
    ...overrides,
  } as Mocked<IVcsSourceClient>;
}

/** Create a mock IDataSourceConnector with all capabilities (transitions + attachments). */
export function createMockConnector(
  overrides: Partial<
    IDataSourceIdentity & Mocked<IDataSourceConnector & ISupportsTransitions & ISupportsAttachments>
  > = {},
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
 * A fake CLI subprocess whose stdout and stderr streams carry `stdout` and `stderr`. It settles once both streams
 * have been read to the end: resolved with `exitCode`, or rejected with `error`.
 */
export function fakeCliProcess(
  stdout: string,
  { stderr = "", exitCode = 0, error }: { stderr?: string; exitCode?: number; error?: Error } = {},
): ResultPromise {
  const out = new PassThrough();
  const err = new PassThrough();
  out.end(stdout);
  err.end(stderr);
  const settled = Promise.all([once(out, "close"), once(err, "close")]).then(() => {
    if (error) throw error;
    return { exitCode, stdout, stderr };
  });
  return Object.assign(settled, { stdout: out, stderr: err, kill: vi.fn() }) as unknown as ResultPromise;
}

/**
 * An `execa` stand-in for a host stage's executor: the workspace's `git init` succeeds at once, and every other
 * command gets the process `cli` starts.
 */
export function hostStageProcesses(cli: () => ResultPromise): typeof execa {
  return ((file: string) => (file === "git" ? Promise.resolve(fakeExecResult()) : cli())) as unknown as typeof execa;
}

/** Create a mock CLI executor whose runs exit cleanly without output. */
export function createMockExecutor(): ICliExecutor & Mocked<ICliExecutor> {
  return {
    run: vi.fn().mockResolvedValue(makeExecResult()),
    continueSession: vi.fn().mockResolvedValue(makeExecResult()),
    killActive: vi.fn(),
  };
}

/** Create a mock stage executor factory whose executors are fresh mock executors. */
export function createMockStageExecutors(
  overrides: Partial<Mocked<IStageExecutorFactory>> = {},
): Mocked<IStageExecutorFactory> {
  return {
    create: vi.fn().mockImplementation(async () => createMockExecutor()),
    createHost: vi.fn().mockImplementation(async () => createMockExecutor()),
    ...overrides,
  };
}

/** Create a mock AgentSessionRunner whose runs complete. */
export function createMockSessionRunner(
  overrides: Partial<Mocked<IAgentSessionRunner>> = {},
): Mocked<IAgentSessionRunner> {
  return {
    run: vi.fn().mockResolvedValue(makeResult("DF-100")),
    ...overrides,
  };
}

/**
 * Create a mock CLI runtime whose container paths are tagged with the CLI name.
 *
 * Methods are spies: no compose contribution, no log sources, a plain-text decoder.
 */
export function createMockCliRuntime(
  cli: CliType,
  overrides: Partial<ICliRuntime> = {},
): ICliRuntime & Mocked<ICliRuntime> {
  return {
    cli,
    layout: {
      configDir: `/workspace/.cfg-${cli}`,
      writableDirs: [`/workspace/.cfg-${cli}/logs`],
      agentsDir: `/workspace/.cfg-${cli}/agents`,
      skillsDir: `/workspace/.cfg-${cli}/skills`,
      debugLog: { kind: CliDebugLogKind.File, path: `/workspace/.cfg-${cli}/debug.log` },
      transcriptPath: null,
      binary: `/usr/local/bin/${cli}`,
    },
    models: modelPolicyFor(cli),
    credentials: { required: [] },
    agentWriter: { write: vi.fn().mockReturnValue(null), modelOf: vi.fn().mockReturnValue(undefined) },
    toolNames: { subagent: "spawn", skill: "skill", shell: "sh", read: "read", askUser: "ask" },
    mountsEachRenderedItem: false,
    egressDomains: [],
    workspaceMountTargets: [],
    hostRenderDirs: vi.fn().mockImplementation(({ cliHomeDir }: { cliHomeDir: string }) => ({
      agentsDir: `${cliHomeDir}/${cli}-agents`,
      skillsDir: `${cliHomeDir}/${cli}-skills`,
    })),
    composeContribution: vi.fn().mockReturnValue({ volumes: [], env: {} }),
    writeTaskArtifacts: vi.fn(),
    logSources: vi.fn().mockReturnValue({ sources: [], exports: [] }),
    createOutputDecoder: vi.fn().mockImplementation(() => new PlainTextDecoder()),
    deriveRunArtifacts: vi.fn().mockResolvedValue({ transcript: null, telemetry: null }),
    sessionStartAudited: vi.fn().mockReturnValue(undefined),
    ...overrides,
  } as ICliRuntime & Mocked<ICliRuntime>;
}

/**
 * Create a mock ComposeClient with `exec` stubbed.
 *
 * Returns both the client and the underlying `exec` spy for assertion.
 */
export function createMockCompose(execImpl?: (...args: any[]) => any): {
  compose: IComposeClient;
  exec: ReturnType<typeof vi.fn>;
} {
  const exec = execImpl ? vi.fn().mockImplementation(execImpl) : vi.fn().mockResolvedValue({ stdout: "", stderr: "" });
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
export function createMockContainer(executeResult?: Partial<RalphResult>): {
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
    executeWithExecutor: vi.fn().mockResolvedValue(result),
    createExecutorForStage: vi.fn().mockResolvedValue(createMockExecutor()),
    sessionStartAudited: vi.fn().mockResolvedValue(true),
    stop: vi.fn().mockResolvedValue(undefined),
    cleanLogDirectory: vi.fn().mockResolvedValue(undefined),
    cleanPaths: vi.fn().mockResolvedValue(undefined),
    prepareConfigDir: vi.fn().mockResolvedValue(undefined),
    collectAll: vi.fn().mockResolvedValue([]),
    detach: vi.fn(),
    clearCollectSources: vi.fn().mockResolvedValue(undefined),
  };

  const container: IContainerManager = {
    start: spies.start,
    checkPrerequisites: spies.checkPrerequisites,
    setup: spies.setup,
    execInApp: spies.execInApp,
    execInSidecar: spies.execInSidecar,
    registerLogSources: spies.registerLogSources,
    executeWithExecutor: spies.executeWithExecutor,
    createExecutorForStage: spies.createExecutorForStage,
    sessionStartAudited: spies.sessionStartAudited,
    stop: spies.stop,
    onToolOutput: undefined,
    onPreToolUse: undefined,
    isRunning: true,
    layouts: [COPILOT_CONTAINER_LAYOUT],
    logs: {
      collectAll: spies.collectAll,
      detach: spies.detach,
      clearCollectSources: spies.clearCollectSources,
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

/** A text redactor that scrubs the word SECRET, from one text or from each text of a batch. */
export function createMockTextRedactor(): Mocked<ITextRedactor> {
  const scrub = (text: string): string => text.replaceAll("SECRET", "[REDACTED]");
  return {
    redact: vi.fn(async (text: string) => scrub(text)),
    redactEach: vi.fn(async (texts: readonly string[]) => texts.map(scrub)),
  };
}

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
    collectResults: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

/** Create a mock WorkItemPoller with all methods stubbed. */
export function createMockPoller(
  overrides: Partial<Mocked<IWorkItemPoller>> & { sourceKey?: string } = {},
): Mocked<IWorkItemPoller> & { sourceKey: string } {
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
    run: vi.fn().mockImplementation(async (ctx: any) => makeResult(ctx.workItem?.id ?? ctx.key ?? "MOCK-1")),
    teardown: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

/** Create a mock ProfileSetupService with all methods stubbed. */
export function createMockProfileSetupService(
  overrides: Partial<Mocked<IProfileSetupService>> = {},
): Mocked<IProfileSetupService> {
  return {
    prepareForTask: vi.fn().mockResolvedValue(undefined),
    prepareForStage: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  } as Mocked<IProfileSetupService>;
}

/** Create a mock TaskWorkspaceManager whose workspaces are prepared and cleaned up without touching the disk. */
export function createMockWorkspaceManager(
  overrides: Partial<Mocked<ITaskWorkspaceManager>> = {},
): Mocked<ITaskWorkspaceManager> {
  return {
    prepare: vi.fn().mockResolvedValue(undefined),
    cleanup: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

/**
 * Create a mock StageWorkspaceResolver: a container stage gets {@link makeContainerWorkspace}, a local stage the host
 * workspace of `<outputDir>/stages/<role>`, a hook stage that of `<outputDir>/hooks/<hook>/<role>`.
 */
export function createMockStageWorkspaces(
  overrides: Partial<Mocked<IStageWorkspaceResolver>> = {},
): Mocked<IStageWorkspaceResolver> {
  return {
    forStage: vi
      .fn()
      .mockImplementation((ctx: TaskContext, stage: IStageConfig) =>
        stage.mode === StageMode.Container
          ? makeContainerWorkspace()
          : makeHostWorkspace({ stageDir: `${ctx.outputDir}/stages/${stage.role}` }),
      ),
    forHookStage: vi.fn().mockImplementation((ctx: TaskContext, hookName: string, stage: IStageConfig) =>
      makeHostWorkspace({
        stageDir: `${ctx.outputDir}/hooks/${hookName}/${stage.role}`,
        artifactDir: `${ctx.outputDir}/hooks/${hookName}/artifacts`,
      }),
    ),
    ...overrides,
  };
}

/** Create a mock PostTaskHookRunner whose hooks finish without doing anything. */
export function createMockHookRunner(
  overrides: Partial<Mocked<IPostTaskHookRunner>> = {},
): Mocked<IPostTaskHookRunner> {
  return {
    run: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

/** Create a mock AgentPipelineExecutor with a default success result. */
export function createMockPipelineExecutor(
  overrides: Partial<Mocked<IAgentPipelineExecutor>> = {},
): Mocked<IAgentPipelineExecutor> {
  return {
    run: vi.fn().mockImplementation(async (ctx: any) => makeResult(ctx.workItem?.id ?? "MOCK-1")),
    ...overrides,
  } as Mocked<IAgentPipelineExecutor>;
}

/** Create a mock AgentTemplateRenderer with all methods stubbed. */
export function createMockTemplateRenderer(
  overrides: Partial<Mocked<IAgentTemplateRenderer>> = {},
): Mocked<IAgentTemplateRenderer> {
  return {
    render: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

/** Create a mock ComposeOverlayWriter with all methods stubbed. */
export function createMockOverlayWriter(
  overrides: Partial<Mocked<IComposeOverlayWriter>> = {},
): Mocked<IComposeOverlayWriter> {
  return {
    write: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

/** Create a mock AppStartupDeps with all steps stubbed. */
export function createMockStartupDeps(overrides: Partial<AppStartupDeps> = {}): AppStartupDeps {
  return {
    validate: vi.fn().mockResolvedValue({ ok: true, errors: [], warnings: [] }),
    printResults: vi.fn().mockReturnValue(true),
    loadConfig: vi.fn().mockReturnValue(makeConfig()),
    loadDataSourceConnectors: vi.fn().mockResolvedValue(undefined),
    buildMcpServers: vi.fn().mockResolvedValue(undefined),
    resolveMcpConfigs: vi.fn().mockResolvedValue(undefined),
    startRalphchives: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}
