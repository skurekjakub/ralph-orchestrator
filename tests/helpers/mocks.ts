/**
 * Service mock factories for testing.
 *
 * All mocks use `vi.fn()` and return typed `Mocked<Interface>` objects.
 * Accept optional overrides to customize individual method implementations.
 */

import { vi, type Mock } from "vitest";
import type { Logger } from "../../src/logger.js";
import type { IJiraClient } from "../../src/jira/client.js";
import type { IIssueManager } from "../../src/services/jira-issue-manager.js";
import type { IResourceManager } from "../../src/services/task-resource-manager.js";
import type { IComposeClient } from "../../src/container/compose-client.js";
import type { IContainerManager } from "../../src/container/manager.js";
import type { ILogCollector } from "../../src/logs/collector.js";
import type { IJiraPoller } from "../../src/jira/poller.js";
import type { ITaskRunner } from "../../src/services/task-runner.js";
import type { RalphResult } from "../../src/container/types.js";
import { makeResult } from "./factories.js";

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

/** Create a mock JiraIssueManager with all methods stubbed. */
export function createMockIssueManager(overrides: Partial<Mocked<IIssueManager>> = {}): Mocked<IIssueManager> {
  return {
    getComments: vi.fn().mockResolvedValue([]),
    postAckComment: vi.fn().mockResolvedValue(undefined),
    refreshIssue: vi.fn().mockResolvedValue(null),
    transitionIssue: vi.fn().mockResolvedValue(undefined),
    postStartComment: vi.fn().mockResolvedValue(undefined),
    postErrorComment: vi.fn().mockResolvedValue(undefined),
    postCrashRecoveryComment: vi.fn().mockResolvedValue(undefined),
    postStaleStatusComment: vi.fn().mockResolvedValue(undefined),
    postComment: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  } as Mocked<IIssueManager>;
}

/** Create a mock TaskJiraResourceManager with all methods stubbed. */
export function createMockResources(overrides: Partial<Mocked<IResourceManager>> = {}): Mocked<IResourceManager> {
  return {
    fetchHandoff: vi.fn().mockResolvedValue(null),
    fetchComments: vi.fn().mockResolvedValue([]),
    attachTranscript: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  } as Mocked<IResourceManager>;
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
  const issueKey = executeResult?.issueKey ?? "MOCK-1";
  const result: RalphResult = makeResult(issueKey, executeResult);

  const spies = {
    start: vi.fn().mockResolvedValue(undefined),
    checkPrerequisites: vi.fn().mockResolvedValue(undefined),
    setup: vi.fn().mockResolvedValue(undefined),
    registerLogSources: vi.fn(),
    execute: vi.fn().mockResolvedValue(result),
    stop: vi.fn().mockResolvedValue(undefined),
    cleanLogDirectory: vi.fn().mockResolvedValue(undefined),
    cleanPaths: vi.fn().mockResolvedValue(undefined),
    collectAll: vi.fn().mockResolvedValue([]),
    attach: vi.fn(),
    detach: vi.fn(),
    setIssueKey: vi.fn(),
    addSource: vi.fn(),
  };

  const container: IContainerManager = {
    start: spies.start,
    checkPrerequisites: spies.checkPrerequisites,
    setup: spies.setup,
    registerLogSources: spies.registerLogSources,
    execute: spies.execute,
    stop: spies.stop,
    onToolOutput: undefined,
    logs: {
      collectAll: spies.collectAll,
      attach: spies.attach,
      detach: spies.detach,
      setIssueKey: spies.setIssueKey,
      addSource: spies.addSource,
    },
    cleaner: {
      cleanLogDirectory: spies.cleanLogDirectory,
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

/** Create a mock JiraPoller with all methods stubbed. */
export function createMockPoller(overrides: Partial<Mocked<IJiraPoller>> = {}): Mocked<IJiraPoller> {
  return {
    start: vi.fn(),
    stop: vi.fn(),
    onIssues: vi.fn(),
    drain: vi.fn().mockReturnValue([]),
    ...overrides,
  };
}

/** Create a mock TaskRunner with all methods stubbed. */
export function createMockTaskRunner(overrides: Partial<Mocked<ITaskRunner>> = {}): Mocked<ITaskRunner> {
  return {
    run: vi.fn().mockResolvedValue({
      result: makeResult("MOCK-1"),
      container: createMockContainer().container,
    }),
    ...overrides,
  };
}
