import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { asValue, createContainer, InjectionMode, type AwilixContainer } from "awilix";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { mockExeca } = vi.hoisted(() => ({
  mockExeca: vi.fn().mockResolvedValue({ stdout: "", stderr: "", exitCode: 0 }),
}));

vi.mock("execa", async (importOriginal) => {
  const orig = await importOriginal<typeof import("execa")>();
  return { ...orig, execa: mockExeca };
});

import type { OrchestratorCradle } from "../../src/awilix-cradle-types";
import { registerScopedServices } from "../../src/awilix-cradle";
import { createContainerManagerFactory, openTaskScope } from "../../src/container/container-manager-factory";
import { CliRuntimeRegistry } from "../../src/cli/cli-runtime";
import { claudeAgentFileName } from "../../src/cli/claude/claude-agent-writer";
import { CliType, StageMode } from "../../src/config/types";
import { CopilotExecutor } from "../../src/container/cli-executors/copilot-executor";
import { LocalClaudeCodeExecutor } from "../../src/container/cli-executors/local-claude-code-executor";
import type { IAgentSessionRunner } from "../../src/container/agent-session-runner";
import {
  makeAgentTemplate,
  makeContainerWorkspace,
  makeHostWorkspace,
  makeProfile,
  makeResult,
  makeStage,
  makeWorkItem,
} from "../helpers/factories";
import {
  createMockCliRuntime,
  createMockExecutor,
  createMockSessionRunner,
  createSilentLogger,
} from "../helpers/mocks";
import { writeFixtureProfile } from "../helpers/fixture-checkout";

/** Profile setup has written this profile's squid.conf in the fixture checkout. */
const SET_UP = makeProfile({ id: "set-up" });
const NEVER_SET_UP = makeProfile({ id: "never-set-up" });

/** The fixture orchestrator checkout. */
let rootDir: string;

/** A container stage running Copilot. */
const COPILOT_STAGE = makeStage({ agent: "ralph.scientist", role: "review", cli: CliType.Copilot });

/**
 * A root container holding the task and stage registrations and the root tokens their scopes read, its services
 * mocked.
 */
function createRoot(
  sessionRunner: IAgentSessionRunner = createMockSessionRunner(),
): AwilixContainer<OrchestratorCradle> {
  const container = createContainer<OrchestratorCradle>({ injectionMode: InjectionMode.PROXY, strict: true });
  const runtimes = [createMockCliRuntime(CliType.Claude), createMockCliRuntime(CliType.Copilot)];
  container.register({
    rootDir: asValue(rootDir),
    outputConfig: asValue({ logDir: join(rootDir, "output", "logs") }),
    enableContinuation: asValue(false),
    logger: asValue(createSilentLogger()),
    containerLogger: asValue(createSilentLogger()),
    cliRuntimes: asValue(new CliRuntimeRegistry({ runtimes })),
    sessionRunner: asValue(sessionRunner),
  });
  registerScopedServices(container);
  return container;
}

/** The environment of the `index`-th docker invocation. */
function dockerEnv(index: number): Record<string, string> {
  return mockExeca.mock.calls[index][2].env;
}

beforeEach(() => {
  mockExeca.mockClear();
  rootDir = mkdtempSync(join(tmpdir(), "container-manager-factory-"));
  writeFixtureProfile(rootDir, SET_UP.id, { "ralph.scientist": makeAgentTemplate("scientist") });
  const hooksDir = join(rootDir, "shared", "hooks", "claude");
  mkdirSync(hooksDir, { recursive: true });
  writeFileSync(join(hooksDir, "hooks.json"), "{}");
});

afterEach(() => {
  rmSync(rootDir, { recursive: true, force: true });
});

describe("openTaskScope", () => {
  it("holds every task token: its container manager resolves and builds the stages' executors", async () => {
    // Arrange
    const scope = openTaskScope(createRoot(), { profile: SET_UP, workspacePath: "/workspaces/DF-1-1000" });

    // Act
    const executor = await scope
      .resolve("containerManager")
      .createExecutorForStage(COPILOT_STAGE, makeContainerWorkspace());

    // Assert
    expect(executor).toBeInstanceOf(CopilotExecutor);
  });

  it("hands its stage scopes the task's compose client", () => {
    // Arrange
    const scope = openTaskScope(createRoot(), { profile: SET_UP, workspacePath: "/workspaces/DF-1-1000" });

    // Act
    const first = scope.createScope().resolve("compose");
    const second = scope.createScope().resolve("compose");

    // Assert
    expect(first).toBe(scope.resolve("compose"));
    expect(second).toBe(scope.resolve("compose"));
  });
});

describe("createContainerManagerFactory", () => {
  describe("create", () => {
    it("runs each task's stack on that task's workspace", async () => {
      // Arrange
      const factory = createContainerManagerFactory(createRoot());
      const first = factory.create(SET_UP, "/workspaces/DF-1-1000");
      const second = factory.create(SET_UP, "/workspaces/DF-2-2000");

      // Act
      await first.execInApp(["true"]);
      await second.execInApp(["true"]);

      // Assert
      expect(dockerEnv(0).TARGET_REPO_PATH).toBe("/workspaces/DF-1-1000");
      expect(dockerEnv(1).TARGET_REPO_PATH).toBe("/workspaces/DF-2-2000");
    });

    it("hands the stack the profile's squid.conf and the checkout's shared hooks", async () => {
      // Arrange
      const manager = createContainerManagerFactory(createRoot()).create(SET_UP, "/workspaces/DF-1-1000");

      // Act
      await manager.execInApp(["true"]);

      // Assert
      expect(dockerEnv(0)).toMatchObject({
        SQUID_CONF_PATH: join(rootDir, "profiles", SET_UP.id, ".build", "squid.conf"),
        SHARED_HOOKS_PATH: join(rootDir, "shared", "hooks"),
      });
    });

    it("runs the task's stages through the root session runner", async () => {
      // Arrange
      const expected = makeResult("DF-1");
      const sessionRunner = createMockSessionRunner({ run: vi.fn().mockResolvedValue(expected) });
      const manager = createContainerManagerFactory(createRoot(sessionRunner)).create(SET_UP, "/workspaces/DF-1-1000");

      // Act
      const result = await manager.executeWithExecutor(createMockExecutor(), SET_UP.stages[0], makeWorkItem("DF-1"));

      // Assert
      expect(result).toBe(expected);
    });
  });

  describe("forceDown", () => {
    it("takes the profile's stack down with the workspaces directory as its workspace", async () => {
      // Arrange
      const factory = createContainerManagerFactory(createRoot());

      // Act
      await factory.forceDown(SET_UP);

      // Assert
      expect(mockExeca.mock.calls[0][1].slice(-3)).toEqual(["down", "--volumes", "--remove-orphans"]);
      expect(dockerEnv(0).TARGET_REPO_PATH).toBe(join(rootDir, "cache", "workspaces"));
    });

    it("rejects without running docker when profile setup never wrote the profile's squid.conf", async () => {
      // Arrange
      const factory = createContainerManagerFactory(createRoot());

      // Act & Assert
      await expect(factory.forceDown(NEVER_SET_UP)).rejects.toThrow(
        /Profile squid.conf not found at .*never-set-up.*squid\.conf; profile setup has not run for never-set-up/,
      );
      expect(mockExeca).not.toHaveBeenCalled();
    });
  });

  describe("createLocalSession", () => {
    it("runs a hook stage's Claude Code on the host in the hook's workspace, with no task scope open", async () => {
      // Arrange
      const stage = makeStage({
        agent: "ralph.scientist",
        role: "scientist",
        mode: StageMode.Local,
        cli: CliType.Claude,
      });
      const stageDir = join(rootDir, "output", "logs", "DF-1-1000", "hooks", "run-analysis", "scientist");
      const workspace = makeHostWorkspace({
        stageDir,
        cwd: join(stageDir, "work"),
        agentsOutDir: join(stageDir, "home", "agents"),
        cliHomeDir: join(stageDir, "home"),
        logDir: join(stageDir, "logs"),
        orchestratorDir: rootDir,
      });
      mkdirSync(workspace.agentsOutDir, { recursive: true });
      writeFileSync(join(workspace.agentsOutDir, claudeAgentFileName("scientist")), makeAgentTemplate("scientist"));
      const { executor } = await createContainerManagerFactory(createRoot()).createLocalSession(
        SET_UP,
        stage,
        workspace,
      );

      // Act
      await executor.run("analyse the run");

      // Assert
      expect(executor).toBeInstanceOf(LocalClaudeCodeExecutor);
      const claude = mockExeca.mock.calls.find(([file]) => file === join(rootDir, "node_modules", ".bin", "claude"));
      expect(claude?.[2]).toMatchObject({ cwd: workspace.cwd });
    });
  });
});
