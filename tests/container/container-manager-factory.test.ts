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
import { taskRegistrations } from "../../src/awilix-cradle";
import { createContainerManagerFactory } from "../../src/container/container-manager-factory";
import { CliRuntimeRegistry } from "../../src/cli/cli-runtime";
import { CliType } from "../../src/config/types";
import type { ICliExecutorFactory } from "../../src/container/cli-executor-factory";
import type { IAgentSessionRunner } from "../../src/container/agent-session-runner";
import { makeProfile } from "../helpers/factories";
import { createMockCliRuntime, createSilentLogger, type Mocked } from "../helpers/mocks";

/** Profile setup has written this profile's squid.conf in the fixture checkout. */
const SET_UP = makeProfile({ id: "set-up" });
const NEVER_SET_UP = makeProfile({ id: "never-set-up" });

/** The fixture orchestrator checkout. */
let rootDir: string;

/** A root container holding the task registrations and the root tokens the task scope reads, its services mocked. */
function createRoot(): AwilixContainer<OrchestratorCradle> {
  const container = createContainer<OrchestratorCradle>({ injectionMode: InjectionMode.PROXY, strict: true });
  const executorFactory: Mocked<ICliExecutorFactory> = { create: vi.fn(), createLocal: vi.fn() };
  const sessionRunner: Mocked<IAgentSessionRunner> = { run: vi.fn() };
  const runtimes = [createMockCliRuntime(CliType.Claude), createMockCliRuntime(CliType.Copilot)];
  container.register({
    rootDir: asValue(rootDir),
    outputConfig: asValue({ logDir: join(rootDir, "output", "logs") }),
    enableContinuation: asValue(false),
    logger: asValue(createSilentLogger()),
    containerLogger: asValue(createSilentLogger()),
    cliRuntimes: asValue(new CliRuntimeRegistry({ runtimes })),
    executorFactory: asValue(executorFactory),
    sessionRunner: asValue(sessionRunner),
  });
  container.register(taskRegistrations);
  return container;
}

/** The environment of the `index`-th docker invocation. */
function dockerEnv(index: number): Record<string, string> {
  return mockExeca.mock.calls[index][2].env;
}

describe("createContainerManagerFactory", () => {
  beforeEach(() => {
    mockExeca.mockClear();
    rootDir = mkdtempSync(join(tmpdir(), "container-manager-factory-"));
    const buildDir = join(rootDir, "profiles", SET_UP.id, ".build");
    mkdirSync(buildDir, { recursive: true });
    writeFileSync(join(buildDir, "squid.conf"), "");
  });

  afterEach(() => {
    rmSync(rootDir, { recursive: true, force: true });
  });

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
});
