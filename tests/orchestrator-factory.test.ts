import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createCradle } from "../src/awilix-cradle";
import { ClaudeAuthMode, CliType } from "../src/config/types";
import { makeConfig, makeHostWorkspace, makeProfile, makeStage } from "./helpers/factories";
import { createMockExecutor } from "./helpers/mocks";
import { TaskWorkspaceManager } from "../src/services/task-workspace-manager";
import { StageWorkspaceResolver } from "../src/services/stage-workspace";

// Ensure built-in data source factories are registered
import "../src/datasource/connectors/jira/factory";

/**
 * Verifies that awilix resolves all cradle services without errors.
 *
 * This catches strict-mode proxy failures when a constructor destructures
 * an optional param that is not registered in the cradle (e.g. `maxLines`,
 * `retryOptions`, `fetchComments`).
 */
describe("createCradle", () => {
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
    const cradle = createCradle(config, { rootDir });

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
    expect(() => createCradle(makeConfig(), { rootDir })).toThrow(
      new Error('JIRA_PAT_TEST_SOURCE and JIRA_EMAIL_TEST_SOURCE must be set in .env for data source "test-source"'),
    );
  });

  it("returns dataSources and profiles from the config", () => {
    const config = makeConfig();
    const cradle = createCradle(config, { rootDir });

    expect(cradle.dataSources).toBe(config.dataSources);
    expect(cradle.profiles).toBe(config.profiles);
  });

  it("returns null heartbeat when dashboard is disabled", () => {
    const config = makeConfig();
    const cradle = createCradle(config, { rootDir });

    expect(cradle.heartbeat).toBeNull();
  });

  it("registers the Copilot CLI runtime", () => {
    // Arrange
    const cradle = createCradle(makeConfig(), { rootDir });

    // Act
    const runtime = cradle.cliRuntimes.get(CliType.Copilot);

    // Assert
    expect(runtime.cli).toBe(CliType.Copilot);
  });

  it("registers the Claude Code runtime with the configured credential", () => {
    // Arrange
    const cradle = createCradle({ ...makeConfig(), claudeAuth: ClaudeAuthMode.ApiKey }, { rootDir });

    // Act
    const runtime = cradle.cliRuntimes.get(CliType.Claude);

    // Assert
    expect(runtime.credentials.required.map((c) => c.envVar)).toEqual(["ANTHROPIC_API_KEY"]);
  });

  it("resolves the executor factory, overlay writer and workspace manager with their CLI runtime dependencies", () => {
    // Arrange
    const cradle = createCradle(makeConfig(), { rootDir });

    // Act & Assert
    expect(cradle.executorFactory).toBeDefined();
    expect(cradle.overlayWriter).toBeDefined();
    expect(cradle.workspaceManager).toBeInstanceOf(TaskWorkspaceManager);
  });

  it("takes the orchestrator checkout from its caller", () => {
    // Arrange
    const checkout = mkdtempSync(join(tmpdir(), "cradle-"));

    // Act
    const cradle = createCradle(makeConfig(), { rootDir: checkout });

    // Assert
    expect(cradle.rootDir).toBe(checkout);
    expect(cradle.sourceReposDir).toBe(join(checkout, "cache", "repos"));
    expect(cradle.stageWorkspaces).toBeInstanceOf(StageWorkspaceResolver);
  });

  it("exposes claudeAuth from the config", () => {
    // Arrange
    const config = { ...makeConfig(), claudeAuth: ClaudeAuthMode.ApiKey };

    // Act
    const cradle = createCradle(config, { rootDir });

    // Assert
    expect(cradle.claudeAuth).toBe(ClaudeAuthMode.ApiKey);
  });

  it("refuses to build a container stack for a profile whose squid.conf was never generated", () => {
    // Arrange
    const cradle = createCradle(makeConfig(), { rootDir });
    const profile = makeProfile({ id: "never-set-up" });

    // Act & Assert
    expect(() => cradle.containerFactory.create(profile, "/tmp/test-workspaces/DF-100-1")).toThrow(
      /Profile squid.conf not found at .*never-set-up.*squid\.conf/,
    );
  });

  it("hands every local session the root session runner", async () => {
    // Arrange
    const cradle = createCradle(makeConfig(), { rootDir });
    const profile = makeProfile();
    const stage = makeStage();
    vi.spyOn(cradle.executorFactory, "createLocal").mockResolvedValue(createMockExecutor());

    // Act
    const first = await cradle.containerFactory.createLocalSession(profile, stage, makeHostWorkspace());
    const second = await cradle.containerFactory.createLocalSession(profile, stage, makeHostWorkspace());

    // Assert
    expect(first.sessionRunner).toBe(cradle.sessionRunner);
    expect(second.sessionRunner).toBe(cradle.sessionRunner);
  });
});
