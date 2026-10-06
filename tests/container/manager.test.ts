/**
 * ContainerManager unit tests.
 *
 * Verifies delegation to injected collaborators after the DI refactor.
 * Every dependency is injected via the constructor — no concrete classes
 * are instantiated, making this fully testable without Docker.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { ContainerManager } from "../../src/container/manager.js";
import type { IComposeClient } from "../../src/container/compose-client.js";
import type { ICliExecutor, ICliExecutorFactory } from "../../src/container/cli-executor-factory.js";
import type { IContainerLogCollector } from "../../src/container/log-collector.js";
import type { IContainerWorkspaceCleaner } from "../../src/container/workspace-cleaner.js";
import type { ILogSourceRegistry } from "../../src/container/log-source-registry.js";
import type { IAgentSessionRunner } from "../../src/container/agent-session-runner.js";
import { TaskStatus, type CliPaths } from "../../src/container/types.js";
import { makeProfile, makeWorkItem } from "../helpers/factories.js";
import { createSilentLogger, type Mocked } from "../helpers/mocks.js";
import type { Logger } from "../../src/logger.js";
import type { ResultPromise } from "execa";
const KEY = "DF-100";

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
    addExport: vi.fn(),
    attach: vi.fn(),
    detach: vi.fn(),
    collectAll: vi.fn().mockResolvedValue([]),
    clearCollectSources: vi.fn().mockResolvedValue(undefined),
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

function createMockSessionRunner(): Mocked<IAgentSessionRunner> {
  return {
    run: vi.fn().mockResolvedValue({
      taskId: "DF-100",
      status: TaskStatus.Completed,
      durationMs: 100,
      exitCode: 0,
      stdout: "",
      stderr: "",
      collectedLogs: {},
    }),
  };
}

// ── Harness ──────────────────────────────────────────────────────────────────

interface Harness {
  manager: ContainerManager;
  compose: Mocked<IComposeClient>;
  executor: Mocked<ICliExecutor> & { paths: CliPaths };
  executorFactory: Mocked<ICliExecutorFactory>;
  logs: Mocked<IContainerLogCollector>;
  cleaner: Mocked<IContainerWorkspaceCleaner>;
  logRegistry: Mocked<ILogSourceRegistry>;
  sessionRunner: Mocked<IAgentSessionRunner>;
  logger: Logger;
}

function createHarness(overrides?: Partial<Harness>): Harness {
  const compose = overrides?.compose ?? createMockComposeClient();
  const executor = overrides?.executor ?? createMockExecutor();
  const executorFactory =
    overrides?.executorFactory ??
    ({ create: vi.fn().mockReturnValue(createMockExecutor()) } as unknown as Mocked<ICliExecutorFactory>);
  const logs = overrides?.logs ?? createMockLogCollector();
  const cleaner = overrides?.cleaner ?? createMockCleaner();
  const logRegistry = overrides?.logRegistry ?? createMockLogRegistry();
  const sessionRunner = overrides?.sessionRunner ?? createMockSessionRunner();
  const logger = overrides?.logger ?? createSilentLogger();
  const profile = makeProfile();

  const manager = new ContainerManager({
    profile,
    compose: compose as unknown as IComposeClient,
    executor,
    executorFactory: executorFactory as unknown as ICliExecutorFactory,
    logs: logs as unknown as IContainerLogCollector,
    cleaner: cleaner as unknown as IContainerWorkspaceCleaner,
    logRegistry: logRegistry as unknown as ILogSourceRegistry,
    sessionRunner: sessionRunner as unknown as IAgentSessionRunner,
    logger,
  });

  return { manager, compose, executor, executorFactory, logs, cleaner, logRegistry, sessionRunner, logger };
}

describe("ContainerManager", () => {
  let tempDir: string;

  beforeEach(() => {
    vi.clearAllMocks();
    tempDir = mkdtempSync(join(tmpdir(), "manager-test-"));
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
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
      await manager.start(new AbortController().signal);
      expect(compose.compose).toHaveBeenCalledWith(["up", "-d", "--build"]);
    });

    it("checks docker before compose up", async () => {
      const callOrder: string[] = [];
      const compose = createMockComposeClient();
      compose.checkDocker.mockImplementation(async () => {
        callOrder.push("checkDocker");
      });
      compose.compose.mockImplementation(() => {
        callOrder.push("compose");
        return fakeResultPromise();
      });
      const { manager } = createHarness({ compose });

      await manager.start(new AbortController().signal);
      expect(callOrder).toEqual(["checkDocker", "compose"]);
    });

    it("stops the container when the abort signal fires", async () => {
      const controller = new AbortController();
      const compose = createMockComposeClient();
      const { manager } = createHarness({ compose });

      await manager.start(controller.signal);
      expect(manager.isRunning).toBe(true);

      compose.compose.mockReset();
      compose.compose.mockReturnValue(fakeResultPromise());
      controller.abort();

      await vi.waitFor(() => {
        expect(compose.compose).toHaveBeenCalledWith(["down", "--volumes", "--remove-orphans"]);
      });
    });
  });

  describe("setup", () => {
    it("runs the profile setup script in the container", async () => {
      const _profile = makeProfile({ setupScript: "/usr/local/bin/setup.sh" });
      const compose = createMockComposeClient();
      const { manager } = createHarness({ compose });
      // ContainerManager uses the profile's setupScript
      await manager.setup();

      expect(compose.exec).toHaveBeenCalledWith(expect.arrayContaining(["--user", "vscode", "app"]));
    });
  });

  describe("execInApp", () => {
    it("delegates to compose.exec with vscode user", async () => {
      const compose = createMockComposeClient();
      compose.exec.mockReturnValue(fakeResultPromise({ stdout: "output", stderr: "" }));
      const { manager } = createHarness({ compose });

      const result = await manager.execInApp(["echo", "hello"]);

      expect(compose.exec).toHaveBeenCalledWith(["--user", "vscode", "app", "echo", "hello"]);
      expect(result.stdout).toBe("output");
    });
  });

  describe("execInSidecar", () => {
    it("delegates to compose.exec targeting mcp-sidecar", async () => {
      const compose = createMockComposeClient();
      compose.exec.mockReturnValue(fakeResultPromise({ stdout: "sidecar-output", stderr: "" }));
      const { manager } = createHarness({ compose });

      const result = await manager.execInSidecar(["git", "status"]);

      expect(compose.exec).toHaveBeenCalledWith(["mcp-sidecar", "git", "status"]);
      expect(result.stdout).toBe("sidecar-output");
    });
  });

  describe("registerLogSources", () => {
    it("delegates to logRegistry.registerAll", () => {
      const { manager, logRegistry, logs } = createHarness();
      manager.registerLogSources(KEY, "DF-100", tempDir);

      expect(logRegistry.registerAll).toHaveBeenCalledWith(
        logs,
        expect.any(Object), // profile
        KEY,
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

      manager.registerLogSources(KEY, "DF-100", tempDir);

      expect(logRegistry.registerAll).toHaveBeenCalledWith(
        expect.anything(),
        expect.anything(),
        KEY,
        "DF-100",
        expect.objectContaining({ onToolOutput, onPreToolUse }),
        cliPaths,
      );
    });

    it("always provides an onCliDebug callback for file streaming", () => {
      const { manager, logRegistry } = createHarness();

      manager.registerLogSources(KEY, "DF-100", tempDir);

      const callbacks = logRegistry.registerAll.mock.calls[0][4];
      expect(callbacks.onCliDebug).toBeTypeOf("function");
    });
  });

  describe("execute", () => {
    it("delegates to session runner with executor and work item", async () => {
      const sessionRunner = createMockSessionRunner();
      const issue = makeWorkItem("DF-200");
      const { manager } = createHarness({ sessionRunner });

      await manager.execute(issue);

      expect(sessionRunner.run).toHaveBeenCalledWith(
        expect.anything(), // executor
        issue,
        undefined,
        expect.objectContaining({ maxContinuations: 0, enableContinuation: false }),
      );
    });

    it("returns the RalphResult from session runner", async () => {
      const sessionRunner = createMockSessionRunner();
      sessionRunner.run.mockResolvedValue({
        taskId: "DF-300",
        status: TaskStatus.Completed,
        durationMs: 200,
        exitCode: 0,
        stdout:
          "===RALPH_RESULT_START===\nPR_URL: https://dev.azure.com/pr/1\nSTATUS: completed\n===RALPH_RESULT_END===",
        stderr: "",
        collectedLogs: {},
        prUrl: "https://dev.azure.com/pr/1",
      });
      const { manager } = createHarness({ sessionRunner });

      const result = await manager.execute(makeWorkItem("DF-300"));

      expect(result.prUrl).toBe("https://dev.azure.com/pr/1");
      expect(result.status).toBe(TaskStatus.Completed);
    });

    it("passes issue context to session runner", async () => {
      const sessionRunner = createMockSessionRunner();
      const context = { previousHandoff: "some handoff", comments: [], isRevision: false };
      const { manager } = createHarness({ sessionRunner });

      await manager.execute(makeWorkItem("DF-500"), context);

      expect(sessionRunner.run).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ id: "DF-500" }),
        context,
        expect.anything(),
      );
    });

    it("passes enableContinuation=false and maxContinuations=0 by default", async () => {
      const sessionRunner = createMockSessionRunner();
      const { manager } = createHarness({ sessionRunner });

      await manager.execute(makeWorkItem("DF-600"));

      expect(sessionRunner.run).toHaveBeenCalledWith(expect.anything(), expect.anything(), undefined, {
        maxContinuations: 0,
        enableContinuation: false,
      });
    });

    it("passes profile maxContinuations when enableContinuation is true", async () => {
      const sessionRunner = createMockSessionRunner();
      const profile = makeProfile();
      const { compose, executor, executorFactory, logs, cleaner, logRegistry, logger } = createHarness();
      const manager = new ContainerManager({
        profile,
        compose: compose as unknown as IComposeClient,
        executor,
        executorFactory: executorFactory as unknown as ICliExecutorFactory,
        logs: logs as unknown as IContainerLogCollector,
        cleaner: cleaner as unknown as IContainerWorkspaceCleaner,
        logRegistry: logRegistry as unknown as ILogSourceRegistry,
        sessionRunner: sessionRunner as unknown as IAgentSessionRunner,
        logger,
        enableContinuation: true,
      });

      await manager.execute(makeWorkItem("DF-601"));

      expect(sessionRunner.run).toHaveBeenCalledWith(expect.anything(), expect.anything(), undefined, {
        maxContinuations: profile.maxContinuations,
        enableContinuation: true,
      });
    });
  });

  describe("stop", () => {
    it("detaches logs, kills executor, and calls compose down", async () => {
      const callOrder: string[] = [];
      const compose = createMockComposeClient();
      const executor = createMockExecutor();
      const logs = createMockLogCollector();

      const { manager } = createHarness({ compose, executor, logs });
      await manager.start(new AbortController().signal);

      // Attach order-tracking after start() so only stop() calls are recorded
      logs.detach.mockImplementation(() => {
        callOrder.push("detach");
      });
      executor.killActive.mockImplementation(() => {
        callOrder.push("killActive");
      });
      compose.compose.mockImplementation(() => {
        callOrder.push("compose-down");
        return fakeResultPromise();
      });

      await manager.stop();

      expect(callOrder).toEqual(["detach", "killActive", "compose-down"]);
      expect(compose.compose).toHaveBeenCalledWith(["down", "--volumes", "--remove-orphans"]);
    });

    it("falls back to docker rm when compose down fails", async () => {
      const compose = createMockComposeClient();
      compose.getContainerName.mockResolvedValue("mock-container-id");

      const { manager } = createHarness({ compose });
      await manager.start(new AbortController().signal);

      compose.compose.mockImplementation(() => {
        throw new Error("compose down failed");
      });

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
