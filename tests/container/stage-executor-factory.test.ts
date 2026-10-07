import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { asValue, createContainer, InjectionMode, type AwilixContainer } from "awilix";
import { execa } from "execa";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { OrchestratorCradle, TaskCradle } from "../../src/awilix-cradle-types";
import {
  claudeHostStageRegistrations,
  claudeStageRegistrations,
  copilotHostStageRegistrations,
  copilotStageRegistrations,
} from "../../src/awilix-cradle";
import { AgentCatalog } from "../../src/cli/agent-catalog";
import { claudeAgentFileName } from "../../src/cli/claude/claude-agent-writer";
import { hostSettingsPath } from "../../src/cli/claude/claude-host-settings";
import { copilotAgentFileName } from "../../src/cli/copilot/copilot-agent-writer";
import { createCliRuntimeRegistry } from "../../src/cli/supported-runtimes";
import { ClaudeAuthMode, CliType, StageMode, type IStageConfig } from "../../src/config/types";
import { ClaudeCodeExecutor } from "../../src/container/cli-executors/claude-code-executor";
import { CopilotExecutor } from "../../src/container/cli-executors/copilot-executor";
import { LocalClaudeCodeExecutor } from "../../src/container/cli-executors/local-claude-code-executor";
import { LocalCopilotExecutor } from "../../src/container/cli-executors/local-copilot-executor";
import type { IComposeClient } from "../../src/container/compose-client";
import { openTaskScope } from "../../src/container/container-manager-factory";
import { loadAgentCatalog } from "../../src/container/setup/agent-catalogs";
import { createHostStageExecutor, createStageExecutorFactory } from "../../src/container/stage-executor-factory";
import { deriveStageProfile, type HostStageWorkspace } from "../../src/container/types";
import type { Logger } from "../../src/logger";
import { makeAgentSource, makeHostWorkspace, makeProfile, makeStage } from "../helpers/factories";
import { createMockCompose, createMockLogger, fakeCliProcess, hostStageProcesses } from "../helpers/mocks";

vi.mock("execa", async (importOriginal) => {
  const orig = await importOriginal<typeof import("execa")>();
  return { ...orig, execa: vi.fn() };
});

vi.mock("../../src/container/setup/agent-catalogs");

/** `ralph.reviewer` (named `reviewer`) spawns `writer`, which spawns `checker`; `ralph.variant` spawns none. */
const CATALOG = new AgentCatalog([
  makeAgentSource("ralph.variant", { name: "variant" }),
  makeAgentSource("ralph.reviewer", { name: "reviewer", subagents: ["writer"] }),
  makeAgentSource("ralph.writer", { name: "writer", subagents: ["checker"] }),
  makeAgentSource("ralph.checker", { name: "checker" }),
]);

/** The variant a task runs, with an agent, model and timeout of its own. */
const VARIANT = makeProfile({ id: "docs", agentName: "ralph.variant", model: "sonnet", timeoutMs: 1_800_000 });

/** What every stage CLI prints on stderr, which its executor logs as a warning. */
const CLI_STDERR = "cli warning\n";

/** A stage of `VARIANT` running `cli` that overrides the variant's agent, model and timeout. */
function reviewerStage(cli: CliType, mode = StageMode.Container): IStageConfig {
  return makeStage({ agent: "ralph.reviewer", role: "review", cli, mode, model: "opus", timeoutMs: 5_000 });
}

/** The fixture orchestrator checkout. */
let rootDir: string;
/** The orchestrator's logger, which no stage CLI's output may reach. */
let logger: Logger;
/** The logger of the stage CLIs' output. */
let containerLogger: Logger;

/** A root container holding the stage registrations and the root tokens the executors read. */
function createRoot(): AwilixContainer<OrchestratorCradle> {
  const root = createContainer<OrchestratorCradle>({ injectionMode: InjectionMode.PROXY, strict: true });
  root.register({
    rootDir: asValue(rootDir),
    cliRuntimes: asValue(createCliRuntimeRegistry(ClaudeAuthMode.OAuthToken)),
    logger: asValue(logger),
    containerLogger: asValue(containerLogger),
  });
  root.register(claudeStageRegistrations);
  root.register(copilotStageRegistrations);
  root.register(claudeHostStageRegistrations);
  root.register(copilotHostStageRegistrations);
  return root;
}

/** The scope of a task running `VARIANT`, whose stack execs through `compose`. */
function createTaskScope(compose: IComposeClient = createMockCompose().compose): AwilixContainer<TaskCradle> {
  const scope = openTaskScope(createRoot(), { profile: VARIANT, workspacePath: join(rootDir, "workspace") });
  scope.register({ compose: asValue(compose) });
  return scope;
}

/** A compose client whose execs run a CLI that prints {@link CLI_STDERR}. */
function cliCompose(): IComposeClient {
  const { compose } = createMockCompose();
  vi.mocked(compose.execWithTimeout).mockImplementation(() => fakeCliProcess("", { stderr: CLI_STDERR }));
  return compose;
}

/** The `docker compose exec` arguments and timeout of the first exec. */
function exec(compose: IComposeClient): { args: string[]; timeoutMs: number } {
  const [args, timeoutMs] = vi.mocked(compose.execWithTimeout).mock.calls[0];
  return { args, timeoutMs };
}

/** The workspace of a host stage under the fixture's output directory, with `agentFile` rendered into it. */
function hostWorkspace(agentFile: string): HostStageWorkspace {
  const outputDir = join(rootDir, "output", "logs", "DF-1-1000");
  const stageDir = join(outputDir, "stages", "review");
  const workspace = makeHostWorkspace({
    stageDir,
    cwd: join(stageDir, "work"),
    artifactDir: join(outputDir, "artifacts"),
    agentsOutDir: join(stageDir, "home", "agents"),
    skillsOutDir: join(stageDir, "home", "skills"),
    cliHomeDir: join(stageDir, "home"),
    logDir: join(stageDir, "logs"),
    orchestratorDir: rootDir,
    additionalDirs: [outputDir],
  });
  mkdirSync(workspace.agentsOutDir, { recursive: true });
  writeFileSync(join(workspace.agentsOutDir, agentFile), "---\nname: reviewer\n---\nbody\n");
  return workspace;
}

/** The arguments and options of the first process spawned from `binary`. */
function spawned(binary: string): { args: string[]; options: Record<string, unknown> } {
  const calls = vi.mocked(execa).mock.calls as unknown as [string, string[], Record<string, unknown>][];
  const [, args, options] = calls.filter(([file]) => file === binary)[0];
  return { args, options };
}

/** The value following `name` in `args`. */
function argAfter(args: readonly string[], name: string): string {
  return args[args.indexOf(name) + 1];
}

beforeEach(() => {
  rootDir = mkdtempSync(join(tmpdir(), "stage-executor-factory-"));
  const hooksDir = join(rootDir, "shared", "hooks", "claude");
  mkdirSync(hooksDir, { recursive: true });
  writeFileSync(
    join(hooksDir, "hooks.json"),
    JSON.stringify({
      SessionStart: [{ hooks: [{ type: "command", command: "/workspace/.ralph/hooks/log-session-start.sh" }] }],
    }),
  );
  logger = createMockLogger();
  containerLogger = createMockLogger();
  vi.mocked(loadAgentCatalog).mockReset().mockResolvedValue(CATALOG);
  vi.mocked(execa).mockReset();
  vi.mocked(execa).mockImplementation(hostStageProcesses(() => fakeCliProcess("", { stderr: CLI_STDERR })));
});

afterEach(() => {
  rmSync(rootDir, { recursive: true, force: true });
});

describe("createStageExecutorFactory", () => {
  describe("create", () => {
    it("creates a CopilotExecutor for a stage that runs Copilot, without loading agents", async () => {
      // Arrange
      const stage = makeStage({ agent: "ralph.reviewer", cli: CliType.Copilot });

      // Act
      const executor = await createStageExecutorFactory(createTaskScope()).create(
        deriveStageProfile(VARIANT, stage),
        stage,
      );

      // Assert
      expect(executor).toBeInstanceOf(CopilotExecutor);
      expect(loadAgentCatalog).not.toHaveBeenCalled();
    });

    it("creates a ClaudeCodeExecutor with the root agent's name and the depth of its subagent graph", async () => {
      // Arrange
      const compose = cliCompose();
      const stage = makeStage({ agent: "ralph.reviewer", cli: CliType.Claude });
      const executor = await createStageExecutorFactory(createTaskScope(compose)).create(
        deriveStageProfile(VARIANT, stage),
        stage,
      );

      // Act
      await executor.run("p");

      // Assert
      expect(executor).toBeInstanceOf(ClaudeCodeExecutor);
      expect(loadAgentCatalog).toHaveBeenCalledWith(rootDir, "docs");
      const { args } = exec(compose);
      expect(argAfter(args, "--agent")).toBe("reviewer");
      expect(args).toContain("CLAUDE_CODE_MAX_SUBAGENT_SPAWN_DEPTH=2");
    });

    it("rejects a Claude Code stage whose agent has no template", async () => {
      // Arrange
      const stage = makeStage({ agent: "ralph.missing", cli: CliType.Claude });

      // Act & Assert
      await expect(
        createStageExecutorFactory(createTaskScope()).create(deriveStageProfile(VARIANT, stage), stage),
      ).rejects.toThrow(/No agent template ralph.missing/);
    });

    it("propagates an agent catalog that fails to load", async () => {
      // Arrange
      vi.mocked(loadAgentCatalog).mockRejectedValue(new Error("Invalid agent set"));
      const stage = makeStage({ agent: "ralph.reviewer", cli: CliType.Claude });

      // Act & Assert
      await expect(
        createStageExecutorFactory(createTaskScope()).create(deriveStageProfile(VARIANT, stage), stage),
      ).rejects.toThrow("Invalid agent set");
    });

    it("runs a Claude Code stage with the stage's agent, model and timeout and logs to the container logger", async () => {
      // Arrange
      const compose = cliCompose();
      const stage = reviewerStage(CliType.Claude);
      const executor = await createStageExecutorFactory(createTaskScope(compose)).create(
        deriveStageProfile(VARIANT, stage),
        stage,
      );

      // Act
      await executor.run("p");

      // Assert
      const { args, timeoutMs } = exec(compose);
      expect(argAfter(args, "--agent")).toBe("reviewer");
      expect(argAfter(args, "--model")).toBe("opus");
      expect(timeoutMs).toBe(5_000);
      expect(containerLogger.warn).toHaveBeenCalledWith("[claude] cli warning");
      expect(logger.info).not.toHaveBeenCalled();
      expect(logger.warn).not.toHaveBeenCalled();
    });

    it("runs a Copilot stage with the stage's agent, model and timeout and logs to the container logger", async () => {
      // Arrange
      const compose = cliCompose();
      const stage = reviewerStage(CliType.Copilot);
      const executor = await createStageExecutorFactory(createTaskScope(compose)).create(
        deriveStageProfile(VARIANT, stage),
        stage,
      );

      // Act
      await executor.run("p");

      // Assert
      const { args, timeoutMs } = exec(compose);
      expect(argAfter(args, "--agent")).toBe("ralph.reviewer");
      expect(argAfter(args, "--model")).toBe("opus");
      expect(timeoutMs).toBe(5_000);
      expect(containerLogger.warn).toHaveBeenCalledWith("[copilot] cli warning");
      expect(logger.info).not.toHaveBeenCalled();
      expect(logger.warn).not.toHaveBeenCalled();
    });
  });

  describe("createHost", () => {
    it("runs a host Claude Code stage with the stage's agent, model and timeout and logs to the container logger", async () => {
      // Arrange
      const stage = reviewerStage(CliType.Claude, StageMode.Local);
      const workspace = hostWorkspace(claudeAgentFileName("reviewer"));
      const executor = await createStageExecutorFactory(createTaskScope()).createHost(
        deriveStageProfile(VARIANT, stage),
        stage,
        workspace,
      );

      // Act
      await executor.run("p");

      // Assert
      const { args, options } = spawned(join(rootDir, "node_modules", ".bin", "claude"));
      expect(argAfter(args, "--agent")).toBe("reviewer");
      expect(argAfter(args, "--model")).toBe("opus");
      expect(options).toMatchObject({ cwd: workspace.cwd, timeout: 5_000 });
      expect(containerLogger.warn).toHaveBeenCalledWith("[local-claude] cli warning");
      expect(logger.info).not.toHaveBeenCalled();
      expect(logger.warn).not.toHaveBeenCalled();
    });

    it("runs a host Copilot stage with the stage's agent, model and timeout and logs to the container logger", async () => {
      // Arrange
      const stage = reviewerStage(CliType.Copilot, StageMode.Local);
      const workspace = hostWorkspace(copilotAgentFileName("ralph.reviewer"));
      const executor = await createStageExecutorFactory(createTaskScope()).createHost(
        deriveStageProfile(VARIANT, stage),
        stage,
        workspace,
      );

      // Act
      await executor.run("p");

      // Assert
      const { args, options } = spawned(join(rootDir, "node_modules", ".bin", "copilot"));
      expect(argAfter(args, "--agent")).toBe("ralph.reviewer");
      expect(argAfter(args, "--model")).toBe("opus");
      expect(options).toMatchObject({ cwd: workspace.cwd, timeout: 5_000 });
      expect(containerLogger.warn).toHaveBeenCalledWith("[local-copilot] cli warning");
      expect(logger.info).not.toHaveBeenCalled();
      expect(logger.warn).not.toHaveBeenCalled();
    });
  });
});

describe("createHostStageExecutor", () => {
  it("creates a LocalCopilotExecutor running the checkout's pinned Copilot CLI, without loading agents", async () => {
    // Arrange
    const stage = makeStage({ agent: "ralph.reviewer", mode: StageMode.Local, cli: CliType.Copilot });
    const workspace = hostWorkspace(copilotAgentFileName("ralph.reviewer"));
    const executor = await createHostStageExecutor(createRoot(), deriveStageProfile(VARIANT, stage), stage, workspace);

    // Act
    await executor.run("p");

    // Assert
    expect(executor).toBeInstanceOf(LocalCopilotExecutor);
    expect(loadAgentCatalog).not.toHaveBeenCalled();
    expect(spawned(join(rootDir, "node_modules", ".bin", "copilot")).options).toMatchObject({ cwd: workspace.cwd });
  });

  it("creates a LocalClaudeCodeExecutor from the profile's agents, running the checkout's pinned Claude Code", async () => {
    // Arrange
    const stage = makeStage({ agent: "ralph.reviewer", mode: StageMode.Local, cli: CliType.Claude });
    const workspace = hostWorkspace(claudeAgentFileName("reviewer"));
    const executor = await createHostStageExecutor(createRoot(), deriveStageProfile(VARIANT, stage), stage, workspace);

    // Act
    await executor.run("p");

    // Assert
    expect(executor).toBeInstanceOf(LocalClaudeCodeExecutor);
    expect(loadAgentCatalog).toHaveBeenCalledWith(rootDir, "docs");
    const { args, options } = spawned(join(rootDir, "node_modules", ".bin", "claude"));
    expect(argAfter(args, "--agent")).toBe("reviewer");
    expect(options.env).toMatchObject({ CLAUDE_CODE_MAX_SUBAGENT_SPAWN_DEPTH: "2" });
  });

  it("runs host Claude Code with the checkout's shared hooks and lets it spawn every agent the stage root reaches", async () => {
    // Arrange
    const stage = makeStage({ agent: "ralph.reviewer", mode: StageMode.Local, cli: CliType.Claude });
    const workspace = hostWorkspace(claudeAgentFileName("reviewer"));
    const executor = await createHostStageExecutor(createRoot(), deriveStageProfile(VARIANT, stage), stage, workspace);

    // Act
    await executor.run("p");

    // Assert
    const settings = JSON.parse(readFileSync(hostSettingsPath(workspace), "utf-8"));
    expect(settings.hooks.SessionStart[0].hooks[0].command).toBe(
      `'${join(rootDir, "shared", "hooks", "log-session-start.sh")}'`,
    );
    expect(settings.permissions.allow).toEqual(expect.arrayContaining(["Agent(writer)", "Agent(checker)"]));
    expect(settings.permissions.allow).not.toContain("Agent(reviewer)");
  });

  it("rejects a host Claude Code stage whose agent has no template", async () => {
    // Arrange
    const stage = makeStage({ agent: "ralph.missing", mode: StageMode.Local, cli: CliType.Claude });

    // Act & Assert
    await expect(
      createHostStageExecutor(createRoot(), deriveStageProfile(VARIANT, stage), stage, makeHostWorkspace()),
    ).rejects.toThrow(/No agent template ralph.missing/);
  });
});
