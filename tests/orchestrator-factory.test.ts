import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { WebSocket } from "ws";

/** A client of the dashboard server: the messages the server sends it are `send`'s calls. */
type FakeClient = { readyState: number; send: (data: string) => void; close: () => void };

const { unboundServers } = vi.hoisted(() => ({ unboundServers: [] as { clients: Set<FakeClient> }[] }));

/** The dashboard server's WebSocket server binds no port; a test connects a client by adding it to `clients`. */
vi.mock("ws", async (importOriginal) => {
  const orig = await importOriginal<typeof import("ws")>();
  const { EventEmitter } = await import("node:events");
  class UnboundWebSocketServer extends EventEmitter {
    readonly clients = new Set<FakeClient>();
    constructor() {
      super();
      unboundServers.push(this);
    }
    close(): void {
      this.clients.clear();
    }
  }
  return { ...orig, WebSocketServer: UnboundWebSocketServer };
});

import { Lifetime } from "awilix";
import { createRootContainer } from "../src/awilix-cradle";
import type {
  ClaudeHostStageCradle,
  ClaudeHostStageValues,
  ClaudeStageCradle,
  CopilotHostStageCradle,
  CopilotStageCradle,
  OrchestratorCradle,
  TaskCradle,
  TaskValues,
} from "../src/awilix-cradle-types";
import { CliRuntimeRegistry } from "../src/cli/cli-runtime";
import { ClaudeAuthMode, CliType, StageMode, type IAppConfig, type IStageConfig } from "../src/config/types";
import { ClaudeCodeExecutor } from "../src/container/cli-executors/claude-code-executor";
import { CopilotExecutor } from "../src/container/cli-executors/copilot-executor";
import { LocalClaudeCodeExecutor } from "../src/container/cli-executors/local-claude-code-executor";
import { LocalCopilotExecutor } from "../src/container/cli-executors/local-copilot-executor";
import { AgentSessionRunner } from "../src/container/agent-session-runner";
import type { ICliExecutor } from "../src/container/cli-executor";
import { ComposeClient } from "../src/container/compose-client";
import { openTaskScope } from "../src/container/container-manager-factory";
import { ContinuationRunner } from "../src/container/continuation-runner";
import { ContainerLogCollector } from "../src/container/log-collector";
import { ContainerManager } from "../src/container/manager";
import { AgentTemplateRenderer } from "../src/container/setup/agent-includes";
import { ComposeOverlayWriter } from "../src/container/setup/compose-overlay-writer";
import { deriveStageProfile } from "../src/container/types";
import { ContainerWorkspaceCleaner } from "../src/container/workspace-cleaner";
import { JiraConnector } from "../src/datasource/connectors/jira/jira-connector";
import { JiraWorkItemPoller } from "../src/datasource/connectors/jira/jira-poller";
import { LogCollector } from "../src/logs/collector";
import { HookRulesRedactor } from "../src/logs/text-redactor";
import { Orchestrator } from "../src/orchestrator";
import { PromptBuilder } from "../src/prompt/prompt-builder";
import { ActivityLog } from "../src/services/activity-log";
import { AgentPipelineExecutor } from "../src/services/agent-pipeline-executor";
import { DashboardServer } from "../src/services/dashboard-server";
import { IssueManager } from "../src/services/issue-manager";
import { OperationLedger } from "../src/services/operation-ledger";
import { PostTaskHookRunner } from "../src/services/post-task-hook-runner";
import { ProfileRouter } from "../src/services/profile-router";
import { ProfileSetupService } from "../src/services/profile-setup-service";
import { RunArtifactsDeriver } from "../src/services/run-artifacts-deriver";
import { StageWorkspaceResolver } from "../src/services/stage-workspace";
import { TaskResourceManager } from "../src/services/task-resource-manager";
import { TaskResultWriter } from "../src/services/task-result-writer";
import { TaskRunner } from "../src/services/task-runner";
import { TaskWorkspaceManager } from "../src/services/task-workspace-manager";
import { TriggerScanner } from "../src/services/trigger-scanner";
import {
  VcsSourceClient,
  adoVcsSourceProviderClient,
  githubVcsSourceProviderClient,
} from "../src/services/vcs-source-client";
import { makeAgentTemplate, makeConfig, makeHostWorkspace, makeProfile, makeStage } from "./helpers/factories";
import { writeFixtureProfile } from "./helpers/fixture-checkout";

// Ensure built-in data source factories are registered
import "../src/datasource/connectors/jira/factory";

/** The executor token of each stage cradle: it resolves only in a stage scope. */
type StageExecutorToken = Exclude<
  keyof ClaudeStageCradle | keyof CopilotStageCradle | keyof ClaudeHostStageCradle | keyof CopilotHostStageCradle,
  keyof TaskCradle | keyof ClaudeHostStageValues
>;

/** Each stage cradle's executor token, with the kind of stage whose scope resolves it and the executor's class. */
const STAGE_EXECUTORS: Record<
  StageExecutorToken,
  { cli: CliType; mode: StageMode; type: abstract new (...args: never[]) => ICliExecutor }
> = {
  claudeCodeExecutor: { cli: CliType.Claude, mode: StageMode.Container, type: ClaudeCodeExecutor },
  copilotExecutor: { cli: CliType.Copilot, mode: StageMode.Container, type: CopilotExecutor },
  localClaudeCodeExecutor: { cli: CliType.Claude, mode: StageMode.Local, type: LocalClaudeCodeExecutor },
  localCopilotExecutor: { cli: CliType.Copilot, mode: StageMode.Local, type: LocalCopilotExecutor },
};

/** The variant the fixture checkout is set up for: its squid.conf is written and its stages' agent exists. */
const SET_UP = makeProfile({ id: "set-up", agentName: "ralph.scientist" });

/** A stage of {@link SET_UP} of the given kind. */
function setUpStage(cli: CliType, mode: StageMode): IStageConfig {
  return makeStage({ agent: "ralph.scientist", role: "write", cli, mode });
}

/**
 * Verifies that awilix resolves all cradle services without errors.
 *
 * This catches strict-mode proxy failures when a constructor destructures
 * an optional param that is not registered in the cradle (e.g. `maxLines`,
 * `retryOptions`, `fetchComments`).
 */
describe("createRootContainer", () => {
  const rootDir = process.cwd();
  const savedEnv: Record<string, string | undefined> = {};
  const JIRA_ENV_KEYS = ["JIRA_PAT_TEST_SOURCE", "JIRA_EMAIL_TEST_SOURCE"];

  beforeEach(() => {
    for (const k of JIRA_ENV_KEYS) savedEnv[k] = process.env[k];
    process.env.JIRA_PAT_TEST_SOURCE = "test-jira-pat";
    process.env.JIRA_EMAIL_TEST_SOURCE = "test@test.com";
    // Suppress console output from logger/activity-log initialization
    vi.spyOn(console, "log").mockImplementation(() => {});
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    for (const [k, v] of Object.entries(savedEnv)) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
  });

  it("resolves all cradle services without AwilixResolutionError", () => {
    const config = makeConfig();
    const cradle = createRootContainer(config, { rootDir }).cradle;

    expect(cradle.activityLog).toBeDefined();
    expect(cradle.pollers).toBeDefined();
    expect(cradle.connectors).toBeDefined();
    expect(cradle.router).toBeDefined();
    expect(cradle.issueManager).toBeDefined();
    expect(cradle.resources).toBeDefined();
    expect(cradle.taskRunner).toBeDefined();
    expect(cradle.triggerScanner).toBeDefined();
    expect(cradle.ledger).toBeDefined();
    expect(cradle.logger).toBeDefined();
  });

  it("fails with the JIRA credential error when a data source's PAT is unset", () => {
    // Arrange
    delete process.env.JIRA_PAT_TEST_SOURCE;

    // Act & Assert
    expect(() => createRootContainer(makeConfig(), { rootDir }).cradle).toThrow(
      new Error('JIRA_PAT_TEST_SOURCE and JIRA_EMAIL_TEST_SOURCE must be set in .env for data source "test-source"'),
    );
  });

  it("returns dataSources and profiles from the config", () => {
    const config = makeConfig();
    const cradle = createRootContainer(config, { rootDir }).cradle;

    expect(cradle.dataSources).toBe(config.dataSources);
    expect(cradle.profiles).toBe(config.profiles);
  });

  it("returns null heartbeat when dashboard is disabled", () => {
    const config = makeConfig();
    const cradle = createRootContainer(config, { rootDir }).cradle;

    expect(cradle.heartbeat).toBeNull();
  });

  it("registers the Copilot CLI runtime", () => {
    // Arrange
    const cradle = createRootContainer(makeConfig(), { rootDir }).cradle;

    // Act
    const runtime = cradle.cliRuntimes.get(CliType.Copilot);

    // Assert
    expect(runtime.cli).toBe(CliType.Copilot);
  });

  it("registers the Claude Code runtime with the configured credential", () => {
    // Arrange
    const cradle = createRootContainer({ ...makeConfig(), claudeAuth: ClaudeAuthMode.ApiKey }, { rootDir }).cradle;

    // Act
    const runtime = cradle.cliRuntimes.get(CliType.Claude);

    // Assert
    expect(runtime.credentials.required.map((c) => c.envVar)).toEqual(["ANTHROPIC_API_KEY"]);
  });

  it("resolves the overlay writer and workspace manager with their CLI runtime dependencies", () => {
    // Arrange
    const cradle = createRootContainer(makeConfig(), { rootDir }).cradle;

    // Act & Assert
    expect(cradle.overlayWriter).toBeDefined();
    expect(cradle.workspaceManager).toBeInstanceOf(TaskWorkspaceManager);
  });

  it("takes the orchestrator checkout from its caller", () => {
    // Arrange
    const checkout = mkdtempSync(join(tmpdir(), "cradle-"));

    // Act
    const cradle = createRootContainer(makeConfig(), { rootDir: checkout }).cradle;

    // Assert
    expect(cradle.rootDir).toBe(checkout);
    expect(cradle.sourceReposDir).toBe(join(checkout, "cache", "repos"));
    expect(cradle.stageWorkspaces).toBeInstanceOf(StageWorkspaceResolver);
  });

  it("exposes claudeAuth from the config", () => {
    // Arrange
    const config = { ...makeConfig(), claudeAuth: ClaudeAuthMode.ApiKey };

    // Act
    const cradle = createRootContainer(config, { rootDir }).cradle;

    // Assert
    expect(cradle.claudeAuth).toBe(ClaudeAuthMode.ApiKey);
  });

  it("refuses to build a container stack for a profile whose squid.conf was never generated", () => {
    // Arrange
    const cradle = createRootContainer(makeConfig(), { rootDir }).cradle;
    const profile = makeProfile({ id: "never-set-up" });

    // Act & Assert
    expect(() => cradle.containerFactory.create(profile, "/tmp/test-workspaces/DF-100-1")).toThrow(
      /Profile squid.conf not found at .*never-set-up.*squid\.conf/,
    );
  });

  it("hands every local session the root session runner", async () => {
    // Arrange
    const cradle = createRootContainer(makeConfig(), { rootDir }).cradle;
    const profile = makeProfile();
    const stage = makeStage({ mode: StageMode.Local, cli: CliType.Copilot });

    // Act
    const first = await cradle.containerFactory.createLocalSession(profile, stage, makeHostWorkspace());
    const second = await cradle.containerFactory.createLocalSession(profile, stage, makeHostWorkspace());

    // Assert
    expect(first.sessionRunner).toBe(cradle.sessionRunner);
    expect(second.sessionRunner).toBe(cradle.sessionRunner);
  });

  describe("from a fixture checkout", () => {
    let checkout: string;

    /** The test config, running {@link SET_UP}, its logs under the fixture checkout. */
    function fixtureConfig(): IAppConfig {
      return { ...makeConfig([SET_UP]), output: { logDir: join(checkout, "output", "logs") } };
    }

    /** The values of a task running {@link SET_UP}, its workspace under the fixture checkout. */
    function taskValues(): TaskValues {
      return { profile: SET_UP, workspacePath: join(checkout, "cache", "workspaces", "DF-1-1000") };
    }

    /** What each root token of `config`'s cradle resolves to: an instance of its class, or its value. */
    function rootExpectations(config: IAppConfig): Record<keyof OrchestratorCradle, unknown> {
      const logger = { info: expect.any(Function), warn: expect.any(Function), error: expect.any(Function) };
      return {
        rootDir: checkout,
        sourceReposDir: join(checkout, "cache", "repos"),
        dataSources: config.dataSources,
        outputConfig: config.output,
        dashboardConfig: config.dashboard,
        profiles: config.profiles,
        promptAuditConfig: config.promptAudit,
        ralphchivesConfig: config.ralphchives,
        enableContinuation: config.enableContinuation,
        claudeAuth: config.claudeAuth,
        activityLog: expect.any(ActivityLog),
        logger,
        containerLogger: logger,
        connectors: new Map([["test-source", expect.any(JiraConnector)]]),
        pollers: new Map([["test-source", expect.any(JiraWorkItemPoller)]]),
        issueManager: expect.any(IssueManager),
        resources: expect.any(TaskResourceManager),
        vcsProviderClients: [adoVcsSourceProviderClient, githubVcsSourceProviderClient],
        vcsSourceClient: expect.any(VcsSourceClient),
        ledger: expect.any(OperationLedger),
        router: expect.any(ProfileRouter),
        triggerScanner: expect.any(TriggerScanner),
        orchestrator: expect.any(Orchestrator),
        dashboardServer: expect.any(DashboardServer),
        cliRuntimes: expect.any(CliRuntimeRegistry),
        logCollector: expect.any(LogCollector),
        promptBuilder: expect.any(PromptBuilder),
        continuationRunner: expect.any(ContinuationRunner),
        sessionRunner: expect.any(AgentSessionRunner),
        templateRenderer: expect.any(AgentTemplateRenderer),
        overlayWriter: expect.any(ComposeOverlayWriter),
        containerFactory: {
          create: expect.any(Function),
          forceDown: expect.any(Function),
          createLocalSession: expect.any(Function),
        },
        workspaceManager: expect.any(TaskWorkspaceManager),
        stageWorkspaces: expect.any(StageWorkspaceResolver),
        profileSetup: expect.any(ProfileSetupService),
        pipelineExecutor: expect.any(AgentPipelineExecutor),
        textRedactor: expect.any(HookRulesRedactor),
        runArtifacts: expect.any(RunArtifactsDeriver),
        resultWriter: expect.any(TaskResultWriter),
        hookRunner: expect.any(PostTaskHookRunner),
        taskRunner: expect.any(TaskRunner),
        heartbeat: null,
      };
    }

    /** What each token a task scope adds to the root's resolves to, in the scope of a task running `values`. */
    function taskExpectations(
      values: TaskValues,
    ): Record<Exclude<keyof TaskCradle, keyof OrchestratorCradle>, unknown> {
      return {
        profile: values.profile,
        workspacePath: values.workspacePath,
        composeFiles: [
          join(checkout, values.profile.composeFile),
          join(checkout, "shared", "security", "docker-compose.security.yml"),
        ],
        squidConfPath: join(checkout, "profiles", values.profile.id, ".build", "squid.conf"),
        compose: expect.any(ComposeClient),
        containerLogs: expect.any(ContainerLogCollector),
        workspaceCleaner: expect.any(ContainerWorkspaceCleaner),
        containerManager: expect.any(ContainerManager),
        stageExecutors: { create: expect.any(Function), createHost: expect.any(Function) },
      };
    }

    beforeEach(() => {
      checkout = mkdtempSync(join(tmpdir(), "cradle-"));
      writeFixtureProfile(checkout, SET_UP.id, { "ralph.scientist": makeAgentTemplate("scientist") });
      unboundServers.length = 0;
    });

    afterEach(() => {
      rmSync(checkout, { recursive: true, force: true });
    });

    it("streams the orchestrator's state to the dashboard server's clients", () => {
      // Arrange
      const { orchestrator, dashboardServer } = createRootContainer(fixtureConfig(), { rootDir: checkout }).cradle;
      dashboardServer.start();
      const client = { readyState: WebSocket.OPEN, send: vi.fn(), close: vi.fn() };
      unboundServers[0].clients.add(client);

      // Act
      orchestrator.observer.emit();

      // Assert
      expect(client.send).toHaveBeenCalledWith(
        JSON.stringify({ type: "state", data: orchestrator.observer.getState() }),
      );
    });

    it("resolves every root registration from the root container to its class or value", () => {
      // Arrange
      const config = fixtureConfig();
      const root = createRootContainer(config, { rootDir: checkout });
      const rootTokens = Object.entries(root.registrations)
        .filter(([, registration]) => registration.lifetime !== Lifetime.SCOPED)
        .map(([token]) => token);

      // Act
      const resolved = Object.fromEntries(rootTokens.map((token) => [token, root.resolve(token)]));

      // Assert
      expect(resolved).toEqual(rootExpectations(config));
    });

    it("resolves every task registration from a task scope to its class or value", () => {
      // Arrange
      const config = fixtureConfig();
      const values = taskValues();
      const scope = openTaskScope(createRootContainer(config, { rootDir: checkout }), values);
      const taskTokens = Object.keys(scope.registrations).filter((token) => !(token in STAGE_EXECUTORS));

      // Act
      const resolved = Object.fromEntries(taskTokens.map((token) => [token, scope.resolve(token)]));

      // Assert
      expect(resolved).toEqual({ ...rootExpectations(config), ...taskExpectations(values) });
    });

    it.each(Object.entries(STAGE_EXECUTORS))(
      "resolves %s for a stage of its kind from a task scope",
      async (_token, { cli, mode, type }) => {
        // Arrange
        const stage = setUpStage(cli, mode);
        const stageProfile = deriveStageProfile(SET_UP, stage);
        const root = createRootContainer(fixtureConfig(), { rootDir: checkout });
        const { stageExecutors } = openTaskScope(root, taskValues()).cradle;

        // Act
        const executor =
          mode === StageMode.Container
            ? await stageExecutors.create(stageProfile, stage)
            : await stageExecutors.createHost(stageProfile, stage, makeHostWorkspace());

        // Assert
        expect(executor).toBeInstanceOf(type);
      },
    );

    it.each(Object.entries(STAGE_EXECUTORS).filter(([, { mode }]) => mode === StageMode.Local))(
      "resolves %s for a post-task hook stage of its kind from the root",
      async (_token, { cli, mode, type }) => {
        // Arrange
        const { containerFactory } = createRootContainer(fixtureConfig(), { rootDir: checkout }).cradle;

        // Act
        const { executor } = await containerFactory.createLocalSession(
          SET_UP,
          setUpStage(cli, mode),
          makeHostWorkspace(),
        );

        // Assert
        expect(executor).toBeInstanceOf(type);
      },
    );
  });
});
