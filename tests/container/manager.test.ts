/**
 * ContainerManager unit tests.
 *
 * Every dependency is injected via the constructor, so the manager is tested without Docker: compose,
 * executors, log collection and the session runner are mocks, the CLI runtimes are mock runtimes.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { ContainerManager } from "../../src/container/manager";
import { CliRuntimeRegistry } from "../../src/cli/cli-runtime";
import { CliType, StageMode, type IAgentProfile } from "../../src/config/types";
import type { IComposeClient } from "../../src/container/compose-client";
import type { ICliExecutorFactory } from "../../src/container/cli-executor-factory";
import type { IContainerLogCollector } from "../../src/container/log-collector";
import type { IContainerWorkspaceCleaner } from "../../src/container/workspace-cleaner";
import type { ILogSourceRegistry } from "../../src/container/log-source-registry";
import type { IAgentSessionRunner } from "../../src/container/agent-session-runner";
import { TaskStatus } from "../../src/container/types";
import { makeProfile, makeResult, makeStage, makeWorkItem } from "../helpers/factories";
import { createMockCliRuntime, createMockExecutor, createMockLogger, type Mocked } from "../helpers/mocks";
import type { Logger } from "../../src/logger";
import type { ResultPromise } from "execa";

const KEY = "DF-100";

vi.mock("execa", async (importOriginal) => {
  const orig = await importOriginal<typeof import("execa")>();
  return { ...orig, execa: vi.fn().mockResolvedValue({ exitCode: 0 }) };
});

// ── Mock factories ───────────────────────────────────────────────────────────

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

function createMockExecutorFactory(): Mocked<ICliExecutorFactory> {
  return {
    create: vi.fn().mockImplementation(async () => createMockExecutor()),
    createLocal: vi.fn().mockImplementation(() => createMockExecutor()),
  };
}

function createMockSessionRunner(): Mocked<IAgentSessionRunner> {
  return { run: vi.fn().mockResolvedValue(makeResult("DF-100")) };
}

// ── Harness ──────────────────────────────────────────────────────────────────

const claudeRuntime = createMockCliRuntime(CliType.Claude);
const copilotRuntime = createMockCliRuntime(CliType.Copilot);

interface Harness {
  manager: ContainerManager;
  compose: Mocked<IComposeClient>;
  executorFactory: Mocked<ICliExecutorFactory>;
  logs: Mocked<IContainerLogCollector>;
  logRegistry: Mocked<ILogSourceRegistry>;
  sessionRunner: Mocked<IAgentSessionRunner>;
  logger: Logger;
}

function createHarness(
  profile: IAgentProfile,
  overrides: Partial<Omit<Harness, "manager">> & { enableContinuation?: boolean } = {},
): Harness {
  const compose = overrides.compose ?? createMockComposeClient();
  const executorFactory = overrides.executorFactory ?? createMockExecutorFactory();
  const logs = overrides.logs ?? createMockLogCollector();
  const logRegistry = overrides.logRegistry ?? { registerAll: vi.fn() };
  const sessionRunner = overrides.sessionRunner ?? createMockSessionRunner();
  const logger = overrides.logger ?? createMockLogger();

  const manager = new ContainerManager({
    profile,
    compose,
    cliRuntimes: new CliRuntimeRegistry({ runtimes: [claudeRuntime, copilotRuntime] }),
    executorFactory,
    logs,
    cleaner: createMockCleaner(),
    logRegistry,
    sessionRunner,
    logger,
    enableContinuation: overrides.enableContinuation,
  });

  return { manager, compose, executorFactory, logs, logRegistry, sessionRunner, logger };
}

describe("ContainerManager", () => {
  let tempDir: string;
  /** A Claude Code container stage followed by a Copilot container stage, on a repo in `tempDir`. */
  let mixedProfile: IAgentProfile;

  beforeEach(() => {
    vi.clearAllMocks();
    tempDir = mkdtempSync(join(tmpdir(), "manager-test-"));
    mixedProfile = makeProfile({
      repoPath: tempDir,
      stages: [
        makeStage({ role: "write", agent: "ralph.ralph", cli: CliType.Claude }),
        makeStage({ role: "review", agent: "ralph.malph", cli: CliType.Copilot }),
      ],
    });
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  describe("checkPrerequisites", () => {
    it("delegates to compose.checkDocker()", async () => {
      // Arrange
      const { manager, compose } = createHarness(mixedProfile);

      // Act
      await manager.checkPrerequisites();

      // Assert
      expect(compose.checkDocker).toHaveBeenCalledOnce();
    });
  });

  describe("start", () => {
    it("checks docker, then runs compose up with the build flag", async () => {
      // Arrange
      const callOrder: string[] = [];
      const compose = createMockComposeClient();
      compose.checkDocker.mockImplementation(async () => {
        callOrder.push("checkDocker");
      });
      compose.compose.mockImplementation(() => {
        callOrder.push("compose");
        return fakeResultPromise();
      });
      const { manager } = createHarness(mixedProfile, { compose });

      // Act
      await manager.start(new AbortController().signal);

      // Assert
      expect(callOrder).toEqual(["checkDocker", "compose"]);
      expect(compose.compose).toHaveBeenCalledWith(["up", "-d", "--build"]);
      expect(manager.isRunning).toBe(true);
    });

    it("creates each container CLI's home in the target repo on the host before compose up", async () => {
      // Arrange
      const compose = createMockComposeClient();
      const homesAtComposeUp: boolean[] = [];
      compose.compose.mockImplementation(() => {
        homesAtComposeUp.push(existsSync(join(tempDir, ".cfg-claude")), existsSync(join(tempDir, ".cfg-copilot")));
        return fakeResultPromise();
      });
      const { manager } = createHarness(mixedProfile, { compose });

      // Act
      await manager.start(new AbortController().signal);

      // Assert
      expect(homesAtComposeUp).toEqual([true, true]);
    });

    it("propagates a compose up failure without marking the container running", async () => {
      // Arrange
      const compose = createMockComposeClient();
      compose.compose.mockReturnValue(Promise.reject(new Error("build failed")) as unknown as ResultPromise);
      const { manager } = createHarness(mixedProfile, { compose });

      // Act & Assert
      await expect(manager.start(new AbortController().signal)).rejects.toThrow("build failed");
      expect(manager.isRunning).toBe(false);
    });

    it("stops the container when the abort signal fires", async () => {
      // Arrange
      const controller = new AbortController();
      const compose = createMockComposeClient();
      const { manager } = createHarness(mixedProfile, { compose });
      await manager.start(controller.signal);
      compose.compose.mockClear();

      // Act
      controller.abort();

      // Assert
      await vi.waitFor(() => {
        expect(compose.compose).toHaveBeenCalledWith(["down", "--volumes", "--remove-orphans"]);
      });
    });
  });

  describe("setup", () => {
    it("runs the profile setup script in the container as vscode", async () => {
      // Arrange
      const { manager, compose } = createHarness({ ...mixedProfile, setupScript: "/usr/local/bin/setup.sh" });

      // Act
      await manager.setup();

      // Assert
      expect(compose.exec).toHaveBeenCalledWith(["--user", "vscode", "app", "/usr/local/bin/setup.sh"]);
    });
  });

  describe("execInApp", () => {
    it("delegates to compose.exec with vscode user", async () => {
      // Arrange
      const compose = createMockComposeClient();
      compose.exec.mockReturnValue(fakeResultPromise({ stdout: "output", stderr: "" }));
      const { manager } = createHarness(mixedProfile, { compose });

      // Act
      const result = await manager.execInApp(["echo", "hello"]);

      // Assert
      expect(compose.exec).toHaveBeenCalledWith(["--user", "vscode", "app", "echo", "hello"]);
      expect(result.stdout).toBe("output");
    });
  });

  describe("execInSidecar", () => {
    it("delegates to compose.exec targeting mcp-sidecar", async () => {
      // Arrange
      const compose = createMockComposeClient();
      compose.exec.mockReturnValue(fakeResultPromise({ stdout: "sidecar-output", stderr: "" }));
      const { manager } = createHarness(mixedProfile, { compose });

      // Act
      const result = await manager.execInSidecar(["git", "status"]);

      // Assert
      expect(compose.exec).toHaveBeenCalledWith(["mcp-sidecar", "git", "status"]);
      expect(result.stdout).toBe("sidecar-output");
    });
  });

  describe("layouts", () => {
    it("are the layouts of the CLIs the container stages run, each once", () => {
      // Arrange
      const profile = makeProfile({
        stages: [
          makeStage({ role: "a", cli: CliType.Copilot }),
          makeStage({ role: "b", cli: CliType.Copilot }),
          makeStage({ role: "c", cli: CliType.Claude, mode: StageMode.Local }),
        ],
      });

      // Act
      const { manager } = createHarness(profile);

      // Assert
      expect(manager.layouts).toEqual([copilotRuntime.layout]);
    });
  });

  describe("registerLogSources", () => {
    it("registers the common sources and those of the container CLIs' runtimes", () => {
      // Arrange
      const { manager, logRegistry, logs } = createHarness(mixedProfile);

      // Act
      manager.registerLogSources(KEY, "DF-100", tempDir);

      // Assert
      expect(logRegistry.registerAll).toHaveBeenCalledWith(
        logs,
        mixedProfile,
        KEY,
        "DF-100",
        expect.objectContaining({ onToolOutput: undefined, onPreToolUse: undefined }),
        [claudeRuntime, copilotRuntime],
      );
    });

    it("passes the tool-output and pre-tool callbacks and always streams the CLI debug log", () => {
      // Arrange
      const { manager, logRegistry } = createHarness(mixedProfile);
      const onToolOutput = vi.fn();
      const onPreToolUse = vi.fn();
      manager.onToolOutput = onToolOutput;
      manager.onPreToolUse = onPreToolUse;

      // Act
      manager.registerLogSources(KEY, "DF-100", tempDir);

      // Assert
      const callbacks = logRegistry.registerAll.mock.calls[0][4];
      expect(callbacks).toMatchObject({ onToolOutput, onPreToolUse });
      expect(callbacks.onCliDebug).toBeTypeOf("function");
    });
  });

  describe("createExecutorForStage", () => {
    it("creates a container stage's executor for the stage profile and logs the stage's CLI", async () => {
      // Arrange
      const { manager, executorFactory, compose, logger } = createHarness(mixedProfile);
      const stage = mixedProfile.stages[0];

      // Act
      const executor = await manager.createExecutorForStage(stage);

      // Assert
      expect(executor).toBe(await executorFactory.create.mock.results[0].value);
      expect(executorFactory.create).toHaveBeenCalledWith(
        compose,
        expect.objectContaining({ agentName: "ralph.ralph", cli: CliType.Claude }),
        stage,
        expect.anything(),
      );
      expect(logger.info).toHaveBeenCalledWith("Stage write: claude CLI (container), agent ralph.ralph");
    });

    it("creates a local stage's executor on the host", async () => {
      // Arrange
      const { manager, executorFactory } = createHarness(mixedProfile);
      const stage = makeStage({ role: "hook", agent: "ralph.scientist", mode: StageMode.Local });

      // Act
      await manager.createExecutorForStage(stage);

      // Assert
      expect(executorFactory.createLocal).toHaveBeenCalledWith(
        expect.objectContaining({ agentName: "ralph.scientist" }),
        stage,
        process.cwd(),
        expect.anything(),
      );
      expect(executorFactory.create).not.toHaveBeenCalled();
    });

    it("propagates an executor factory failure", async () => {
      // Arrange
      const executorFactory = createMockExecutorFactory();
      executorFactory.create.mockRejectedValue(new Error("No agent template ralph.ralph"));
      const { manager } = createHarness(mixedProfile, { executorFactory });

      // Act & Assert
      await expect(manager.createExecutorForStage(mixedProfile.stages[0])).rejects.toThrow("No agent template");
    });
  });

  describe("executeWithExecutor", () => {
    it("runs the given executor through the session runner", async () => {
      // Arrange
      const { manager, sessionRunner } = createHarness(mixedProfile);
      const executor = createMockExecutor();
      const issue = makeWorkItem("DF-200");

      // Act
      await manager.executeWithExecutor(executor, issue);

      // Assert
      expect(sessionRunner.run).toHaveBeenCalledWith(executor, issue, undefined, {
        maxContinuations: 0,
        enableContinuation: false,
      });
    });

    it("returns the RalphResult from the session runner", async () => {
      // Arrange
      const sessionRunner = createMockSessionRunner();
      sessionRunner.run.mockResolvedValue(makeResult("DF-300", { prUrl: "https://dev.azure.com/pr/1" }));
      const { manager } = createHarness(mixedProfile, { sessionRunner });

      // Act
      const result = await manager.executeWithExecutor(createMockExecutor(), makeWorkItem("DF-300"));

      // Assert
      expect(result.prUrl).toBe("https://dev.azure.com/pr/1");
      expect(result.status).toBe(TaskStatus.Completed);
    });

    it("passes issue context and the profile's maxContinuations when continuation is enabled", async () => {
      // Arrange
      const profile = { ...mixedProfile, maxContinuations: 3 };
      const { manager, sessionRunner } = createHarness(profile, { enableContinuation: true });
      const context = { comments: [], isRevision: false, handoffContent: null, triggerParams: {} };

      // Act
      await manager.executeWithExecutor(createMockExecutor(), makeWorkItem("DF-500"), context);

      // Assert
      expect(sessionRunner.run).toHaveBeenCalledWith(expect.anything(), expect.anything(), context, {
        maxContinuations: 3,
        enableContinuation: true,
      });
    });
  });

  describe("sessionStartAudited", () => {
    const AUDIT = '{"event":"session_start","session":"s-1"}\n';

    it("asks the stage CLI's runtime about the target repo's audit log", async () => {
      // Arrange
      mkdirSync(join(tempDir, ".ralph", "logs"), { recursive: true });
      writeFileSync(join(tempDir, ".ralph", "logs", "audit.jsonl"), AUDIT);
      claudeRuntime.sessionStartAudited.mockReturnValue(true);
      const { manager } = createHarness(mixedProfile);

      // Act
      const audited = await manager.sessionStartAudited(CliType.Claude, "s-1");

      // Assert
      expect(audited).toBe(true);
      expect(claudeRuntime.sessionStartAudited).toHaveBeenCalledWith(AUDIT, "s-1");
    });

    it("hands the runtime an empty audit log when the hooks never wrote one", async () => {
      // Arrange
      claudeRuntime.sessionStartAudited.mockReturnValue(false);
      const { manager } = createHarness(mixedProfile);

      // Act
      const audited = await manager.sessionStartAudited(CliType.Claude, "s-1");

      // Assert
      expect(audited).toBe(false);
      expect(claudeRuntime.sessionStartAudited).toHaveBeenCalledWith("", "s-1");
    });
  });

  describe("stop", () => {
    it("detaches logs, kills the last executor and runs compose down, in that order", async () => {
      // Arrange
      const callOrder: string[] = [];
      const executor = createMockExecutor();
      const { manager, compose, logs } = createHarness(mixedProfile);
      await manager.start(new AbortController().signal);
      await manager.executeWithExecutor(executor, makeWorkItem("DF-100"));
      logs.detach.mockImplementation(() => callOrder.push("detach"));
      executor.killActive.mockImplementation(() => callOrder.push("killActive"));
      compose.compose.mockImplementation(() => {
        callOrder.push("compose-down");
        return fakeResultPromise();
      });

      // Act
      await manager.stop();

      // Assert
      expect(callOrder).toEqual(["detach", "killActive", "compose-down"]);
      expect(compose.compose).toHaveBeenCalledWith(["down", "--volumes", "--remove-orphans"]);
    });

    it("runs compose down when no stage has run", async () => {
      // Arrange
      const { manager, compose } = createHarness(mixedProfile);
      await manager.start(new AbortController().signal);

      // Act
      await manager.stop();

      // Assert
      expect(compose.compose).toHaveBeenLastCalledWith(["down", "--volumes", "--remove-orphans"]);
    });

    it("falls back to docker rm when compose down fails", async () => {
      // Arrange
      const compose = createMockComposeClient();
      compose.getContainerName.mockResolvedValue("mock-container-id");
      const { manager } = createHarness(mixedProfile, { compose });
      await manager.start(new AbortController().signal);
      compose.compose.mockImplementation(() => {
        throw new Error("compose down failed");
      });

      // Act & Assert
      await expect(manager.stop()).resolves.toBeUndefined();
    });

    it("does nothing when the container never started", async () => {
      // Arrange
      const { manager, compose, logs } = createHarness(mixedProfile);

      // Act
      await manager.stop();

      // Assert
      expect(logs.detach).not.toHaveBeenCalled();
      expect(compose.compose).not.toHaveBeenCalled();
    });
  });
});
