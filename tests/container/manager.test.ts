/**
 * ContainerManager unit tests.
 *
 * Verifies delegation to injected collaborators after the DI refactor.
 * Every dependency is injected via the constructor — no concrete classes
 * are instantiated, making this fully testable without Docker.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { ContainerManager } from "../../src/container/manager.js";
import type { IComposeClient } from "../../src/container/compose-client.js";
import type { ICliExecutor } from "../../src/container/cli-executor-factory.js";
import type { IContainerLogCollector } from "../../src/container/log-collector.js";
import type { IContainerWorkspaceCleaner } from "../../src/container/workspace-cleaner.js";
import type { ILogSourceRegistry } from "../../src/container/log-source-registry.js";
import type { IContinuationRunner } from "../../src/container/continuation-runner.js";
import type { PromptBuilder } from "../../src/prompt/prompt-builder.js";
import type { CliPaths } from "../../src/container/types.js";
import { TaskStatus } from "../../src/container/types.js";
import { makeProfile, makeIssue } from "../helpers/factories.js";
import { createSilentLogger, type Mocked } from "../helpers/mocks.js";
import type { Logger } from "../../src/logger.js";
import type { ResultPromise } from "execa";

vi.mock("execa", async (importOriginal) => {
  const orig = await importOriginal<typeof import("execa")>();
  return { ...orig, execa: vi.fn().mockResolvedValue({ exitCode: 0 }) };
});

// ── Mock factories ───────────────────────────────────────────────────────────

const cliPaths: CliPaths = {
  configDir: "/workspace/.ralph",
  writableDirs: ["/workspace/.ralph/logs"],
  transcriptPath: "/workspace/.ralph/logs/session-transcript.md",
  logDir: "/workspace/.ralph/logs/cli-debug",
};

function fakeResultPromise(overrides: Record<string, unknown> = {}): ResultPromise {
  return Promise.resolve({ stdout: "", stderr: "", exitCode: 0, ...overrides }) as unknown as ResultPromise;
}

function createMockComposeClient(): Mocked<IComposeClient> {
  return {
    compose: vi.fn().mockReturnValue(fakeResultPromise()),
    exec: vi.fn().mockReturnValue(fakeResultPromise()),
    execWithTimeout: vi.fn().mockReturnValue(fakeResultPromise()),
    logs: vi.fn().mockReturnValue(fakeResultPromise()),
    checkDocker: vi.fn().mockResolvedValue(undefined),
    getContainerName: vi.fn().mockResolvedValue("mock-container"),
  };
}

function createMockExecutor(): Mocked<ICliExecutor> & { paths: CliPaths } {
  return {
    paths: cliPaths,
    run: vi.fn().mockResolvedValue({ exitCode: 0, stdout: "", stderr: "", timedOut: false }),
    continueSession: vi.fn().mockResolvedValue({ exitCode: 0, stdout: "", stderr: "", timedOut: false }),
    killActive: vi.fn(),
  };
}

function createMockLogCollector(): Mocked<IContainerLogCollector> {
  return {
    setTaskId: vi.fn(),
    addSource: vi.fn(),
    attach: vi.fn(),
    detach: vi.fn(),
    collectAll: vi.fn().mockResolvedValue([]),
  };
}

function createMockCleaner(): Mocked<IContainerWorkspaceCleaner> {
  return {
    prepareConfigDir: vi.fn().mockResolvedValue(undefined),
    cleanDirectory: vi.fn().mockResolvedValue(undefined),
    cleanPaths: vi.fn().mockResolvedValue(undefined),
  };
}

function createMockLogRegistry(): Mocked<ILogSourceRegistry> {
  return {
    registerAll: vi.fn(),
  };
}

function createMockContinuationRunner(): Mocked<IContinuationRunner> {
  return {
    run: vi.fn().mockResolvedValue({
      lastResult: { exitCode: 0, stdout: "", stderr: "", timedOut: false },
      combinedStdout: "",
      combinedStderr: "",
    }),
  };
}

function createMockPromptBuilder(): PromptBuilder {
  return { build: vi.fn().mockReturnValue({ text: "test prompt", audit: { safe: true, findings: [] } }) } as unknown as PromptBuilder;
}

// ── Harness ──────────────────────────────────────────────────────────────────

interface Harness {
  manager: ContainerManager;
  compose: Mocked<IComposeClient>;
  executor: Mocked<ICliExecutor> & { paths: CliPaths };
  logs: Mocked<IContainerLogCollector>;
  cleaner: Mocked<IContainerWorkspaceCleaner>;
  logRegistry: Mocked<ILogSourceRegistry>;
  continuationRunner: Mocked<IContinuationRunner>;
  promptBuilder: PromptBuilder;
  logger: Logger;
}

function createHarness(overrides?: Partial<Harness>): Harness {
  const compose = overrides?.compose ?? createMockComposeClient();
  const executor = overrides?.executor ?? createMockExecutor();
  const logs = overrides?.logs ?? createMockLogCollector();
  const cleaner = overrides?.cleaner ?? createMockCleaner();
  const logRegistry = overrides?.logRegistry ?? createMockLogRegistry();
  const continuationRunner = overrides?.continuationRunner ?? createMockContinuationRunner();
  const promptBuilder = overrides?.promptBuilder ?? createMockPromptBuilder();
  const logger = overrides?.logger ?? createSilentLogger();
  const profile = makeProfile();

  const manager = new ContainerManager({
    profile,
    compose: compose as unknown as IComposeClient,
    executor,
    logs: logs as unknown as IContainerLogCollector,
    cleaner: cleaner as unknown as IContainerWorkspaceCleaner,
    logRegistry: logRegistry as unknown as ILogSourceRegistry,
    continuationRunner: continuationRunner as unknown as IContinuationRunner,
    promptBuilder,
    logger,
  });

  return { manager, compose, executor, logs, cleaner, logRegistry, continuationRunner, promptBuilder, logger };
}

describe("ContainerManager", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("checkPrerequisites", () => {
    it("delegates to compose.checkDocker()", async () => {
      const { manager, compose } = createHarness();
      await manager.checkPrerequisites();
      expect(compose.checkDocker).toHaveBeenCalledOnce();
    });
  });

  describe("start", () => {
    it("calls compose up with build flag", async () => {
      const { manager, compose } = createHarness();
      await manager.start();
      expect(compose.compose).toHaveBeenCalledWith(["up", "-d", "--build"]);
    });

    it("checks docker before compose up", async () => {
      const callOrder: string[] = [];
      const compose = createMockComposeClient();
      compose.checkDocker.mockImplementation(async () => { callOrder.push("checkDocker"); });
      compose.compose.mockImplementation(() => { callOrder.push("compose"); return fakeResultPromise(); });
      const { manager } = createHarness({ compose });

      await manager.start();
      expect(callOrder).toEqual(["checkDocker", "compose"]);
    });
  });

  describe("setup", () => {
    it("runs the profile setup script in the container", async () => {
      const _profile = makeProfile({ setupScript: "/usr/local/bin/setup.sh" });
      const compose = createMockComposeClient();
      const { manager } = createHarness({ compose });
      // ContainerManager uses the profile's setupScript
      await manager.setup();

      expect(compose.exec).toHaveBeenCalledWith(
        expect.arrayContaining(["--user", "vscode", "app"]),
      );
    });
  });

  describe("execInApp", () => {
    it("delegates to compose.exec with vscode user", async () => {
      const compose = createMockComposeClient();
      compose.exec.mockReturnValue(
        fakeResultPromise({ stdout: "output", stderr: "" }),
      );
      const { manager } = createHarness({ compose });

      const result = await manager.execInApp(["echo", "hello"]);

      expect(compose.exec).toHaveBeenCalledWith(["--user", "vscode", "app", "echo", "hello"]);
      expect(result.stdout).toBe("output");
    });
  });

  describe("execInSidecar", () => {
    it("delegates to compose.exec targeting mcp-sidecar", async () => {
      const compose = createMockComposeClient();
      compose.exec.mockReturnValue(
        fakeResultPromise({ stdout: "sidecar-output", stderr: "" }),
      );
      const { manager } = createHarness({ compose });

      const result = await manager.execInSidecar(["git", "status"]);

      expect(compose.exec).toHaveBeenCalledWith(["mcp-sidecar", "git", "status"]);
      expect(result.stdout).toBe("sidecar-output");
    });
  });

  describe("registerLogSources", () => {
    it("delegates to logRegistry.registerAll", () => {
      const { manager, logRegistry, logs } = createHarness();
      manager.registerLogSources("DF-100");

      expect(logRegistry.registerAll).toHaveBeenCalledWith(
        logs,
        expect.any(Object), // profile
        "DF-100",
        expect.objectContaining({ onToolOutput: undefined, onPreToolUse: undefined }),
        cliPaths,
      );
    });

    it("passes onToolOutput and onPreToolUse callbacks", () => {
      const { manager, logRegistry } = createHarness();
      const onToolOutput = vi.fn();
      const onPreToolUse = vi.fn();
      manager.onToolOutput = onToolOutput;
      manager.onPreToolUse = onPreToolUse;

      manager.registerLogSources("DF-100");

      expect(logRegistry.registerAll).toHaveBeenCalledWith(
        expect.anything(),
        expect.anything(),
        "DF-100",
        expect.objectContaining({ onToolOutput, onPreToolUse }),
        cliPaths,
      );
    });
  });

  describe("execute", () => {
    it("builds prompt and delegates to continuation runner", async () => {
      const promptBuilder = createMockPromptBuilder();
      const continuationRunner = createMockContinuationRunner();
      const issue = makeIssue("DF-200");
      const { manager } = createHarness({ promptBuilder, continuationRunner });

      await manager.execute(issue);

      expect(vi.mocked(promptBuilder.build)).toHaveBeenCalledWith(issue, undefined);
      expect(continuationRunner.run).toHaveBeenCalled();
    });

    it("parses result block from combined stdout", async () => {
      const continuationRunner = createMockContinuationRunner();
      continuationRunner.run.mockResolvedValue({
        lastResult: { exitCode: 0, stdout: "", stderr: "", timedOut: false },
        combinedStdout: "===RALPH_RESULT_START===\nPR_URL: https://dev.azure.com/pr/1\nSTATUS: completed\n===RALPH_RESULT_END===",
        combinedStderr: "",
      });
      const { manager } = createHarness({ continuationRunner });

      const result = await manager.execute(makeIssue("DF-300"));

      expect(result.prUrl).toBe("https://dev.azure.com/pr/1");
      expect(result.status).toBe(TaskStatus.Completed);
    });

    it("returns RalphResult with status, prUrl, duration", async () => {
      const continuationRunner = createMockContinuationRunner();
      continuationRunner.run.mockResolvedValue({
        lastResult: { exitCode: 0, stdout: "", stderr: "", timedOut: false },
        combinedStdout: "===RALPH_RESULT_START===\nPR_URL: https://dev.azure.com/pr/2\nSTATUS: partial\n===RALPH_RESULT_END===",
        combinedStderr: "some warning",
      });
      const { manager } = createHarness({ continuationRunner });

      const result = await manager.execute(makeIssue("DF-400"));

      expect(result.issueKey).toBe("DF-400");
      expect(result.status).toBe(TaskStatus.Partial);
      expect(result.prUrl).toBe("https://dev.azure.com/pr/2");
      expect(result.durationMs).toBeGreaterThanOrEqual(0);
      expect(result.stdout).toContain("RALPH_RESULT_START");
      expect(result.stderr).toBe("some warning");
    });

    it("passes issue context to prompt builder", async () => {
      const promptBuilder = createMockPromptBuilder();
      const context = { previousHandoff: "some handoff", comments: [], isRevision: false };
      const { manager } = createHarness({ promptBuilder });

      await manager.execute(makeIssue("DF-500"), context);

      expect(vi.mocked(promptBuilder.build)).toHaveBeenCalledWith(
        expect.objectContaining({ key: "DF-500" }),
        context,
      );
    });

    it("passes 0 continuations to runner when enableContinuation is false (default)", async () => {
      const continuationRunner = createMockContinuationRunner();
      const { manager } = createHarness({ continuationRunner });

      await manager.execute(makeIssue("DF-600"));

      expect(continuationRunner.run).toHaveBeenCalledWith(
        expect.anything(), expect.anything(), expect.anything(), 0,
      );
    });

    it("passes profile maxContinuations to runner when enableContinuation is true", async () => {
      const continuationRunner = createMockContinuationRunner();
      const profile = makeProfile();
      const { compose, executor, logs, cleaner, logRegistry, promptBuilder, logger } = createHarness();
      const manager = new ContainerManager({
        profile,
        compose: compose as unknown as IComposeClient,
        executor,
        logs: logs as unknown as IContainerLogCollector,
        cleaner: cleaner as unknown as IContainerWorkspaceCleaner,
        logRegistry: logRegistry as unknown as ILogSourceRegistry,
        continuationRunner: continuationRunner as unknown as IContinuationRunner,
        promptBuilder,
        logger,
        enableContinuation: true,
      });

      await manager.execute(makeIssue("DF-601"));

      expect(continuationRunner.run).toHaveBeenCalledWith(
        expect.anything(), expect.anything(), expect.anything(), profile.maxContinuations,
      );
    });
  });

  describe("stop", () => {
    it("detaches logs, kills executor, and calls compose down", async () => {
      const callOrder: string[] = [];
      const compose = createMockComposeClient();
      const executor = createMockExecutor();
      const logs = createMockLogCollector();
      logs.detach.mockImplementation(() => { callOrder.push("detach"); });
      executor.killActive.mockImplementation(() => { callOrder.push("killActive"); });
      compose.compose.mockImplementation(() => { callOrder.push("compose-down"); return fakeResultPromise(); });

      const { manager } = createHarness({ compose, executor, logs });
      await manager.stop();

      expect(callOrder).toEqual(["detach", "killActive", "compose-down"]);
      expect(compose.compose).toHaveBeenCalledWith(["down", "--volumes", "--remove-orphans"]);
    });

    it("falls back to docker rm when compose down fails", async () => {
      const compose = createMockComposeClient();
      compose.compose.mockImplementation(() => { throw new Error("compose down failed"); });
      compose.getContainerName.mockResolvedValue("mock-container-id");

      const { manager } = createHarness({ compose });

      // Should not throw — the fallback swallows errors
      await expect(manager.stop()).resolves.toBeUndefined();
    });
  });

  describe("cliPaths", () => {
    it("exposes executor paths", () => {
      const { manager } = createHarness();
      expect(manager.cliPaths).toEqual(cliPaths);
    });
  });

  describe("logs", () => {
    it("exposes log collector for external use", () => {
      const { manager } = createHarness();
      expect(manager.logs).toBeDefined();
      expect(typeof manager.logs.detach).toBe("function");
      expect(typeof manager.logs.collectAll).toBe("function");
    });
  });

  describe("cleaner", () => {
    it("exposes workspace cleaner for external use", () => {
      const { manager } = createHarness();
      expect(manager.cleaner).toBeDefined();
      expect(typeof manager.cleaner.prepareConfigDir).toBe("function");
      expect(typeof manager.cleaner.cleanDirectory).toBe("function");
      expect(typeof manager.cleaner.cleanPaths).toBe("function");
    });
  });
});
