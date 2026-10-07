import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { execa, ExecaError } from "execa";
import { LocalClaudeCodeExecutor } from "../../../src/container/cli-executors/local-claude-code-executor";
import { AGENT_RESULT_JSON_SCHEMA } from "../../../src/container/agent-result";
import { ClaudeCodeRuntime } from "../../../src/cli/claude/claude-runtime";
import { hostPermissionRules } from "../../../src/cli/claude/claude-host-settings";
import { ClaudeAuthMode, CliType, StageMode, type IStageConfig } from "../../../src/config/types";
import type { HostStageWorkspace } from "../../../src/container/types";
import { makeHostWorkspace, makeProfile, makeStage } from "../../helpers/factories";
import { createMockLogger, fakeCliProcess, hostStageProcesses } from "../../helpers/mocks";

vi.mock("execa", async (importOriginal) => {
  const orig = await importOriginal<typeof import("execa")>();
  return { ...orig, execa: vi.fn() };
});

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

const BINARY = "/repo/node_modules/.bin/claude";

/** The arguments and options of the n-th claude process, leaving out the workspace's `git init`. */
function spawned(call = 0): { file: string; args: string[]; options: Record<string, unknown> } {
  const calls = vi.mocked(execa).mock.calls as unknown as [string, string[], Record<string, unknown>][];
  const [file, args, options] = calls.filter(([command]) => command === BINARY)[call];
  return { file, args, options };
}

/** One stream-json line. */
const line = (event: object): string => JSON.stringify(event) + "\n";

describe("LocalClaudeCodeExecutor", () => {
  let root: string;
  let orchestratorDir: string;
  let hooksDir: string;
  let workspace: HostStageWorkspace;
  let originalCwd: string;

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), "local-claude-"));
    orchestratorDir = join(root, "orchestrator");
    hooksDir = join(orchestratorDir, "shared", "hooks");
    mkdirSync(join(hooksDir, "claude"), { recursive: true });
    writeFileSync(
      join(hooksDir, "claude", "hooks.json"),
      JSON.stringify({
        SessionStart: [
          { hooks: [{ type: "command", command: "/workspace/.ralph/hooks/log-session-start.sh --cli claude" }] },
        ],
        SessionEnd: [
          { hooks: [{ type: "command", command: "/workspace/.ralph/hooks/log-session-end.sh --cli claude" }] },
        ],
      }),
    );
    originalCwd = process.cwd();
    process.chdir(orchestratorDir);

    const outputDir = join(root, "output", "DF-100-1");
    const stageDir = join(outputDir, "hooks", "run-analysis", "scientist");
    const dirs = { cwd: join(stageDir, "work"), cliHomeDir: join(stageDir, "home") };
    const { agentsDir, skillsDir } = new ClaudeCodeRuntime({ claudeAuth: ClaudeAuthMode.OAuthToken }).hostRenderDirs(
      dirs,
    );
    workspace = makeHostWorkspace({
      ...dirs,
      stageDir,
      logDir: join(stageDir, "logs"),
      artifactDir: join(outputDir, "hooks", "run-analysis", "artifacts"),
      agentsOutDir: agentsDir,
      skillsOutDir: skillsDir,
      orchestratorDir,
      additionalDirs: [
        outputDir,
        join(orchestratorDir, "profiles", "docs", "agents"),
        join(orchestratorDir, "shared", "skills"),
      ],
    });

    vi.mocked(execa).mockReset();
    vi.mocked(execa).mockImplementation(
      hostStageProcesses(() =>
        fakeCliProcess(line({ type: "result", subtype: "success", is_error: false, result: "done" })),
      ),
    );
  });

  afterEach(() => {
    process.chdir(originalCwd);
    vi.unstubAllEnvs();
    rmSync(root, { recursive: true, force: true });
  });

  let logger: ReturnType<typeof createMockLogger>;

  function createExecutor(
    options: { stage?: Partial<IStageConfig>; claudeAuth?: ClaudeAuthMode; subagentDepth?: number } = {},
  ): LocalClaudeCodeExecutor {
    logger = createMockLogger();
    const stage = makeStage({
      agent: "ralph.scientist",
      role: "scientist",
      mode: StageMode.Local,
      cli: CliType.Claude,
      requireResultBlock: false,
      ...options.stage,
    });
    return new LocalClaudeCodeExecutor({
      profile: makeProfile({ id: "docs", model: "opus", timeoutMs: 5000, stages: [stage] }),
      stage,
      agentName: "scientist",
      subagentDepth: options.subagentDepth ?? 1,
      subagents: ["run-analyzer", "agent-improver"],
      workspace,
      runtime: new ClaudeCodeRuntime({ claudeAuth: options.claudeAuth ?? ClaudeAuthMode.OAuthToken }),
      binary: BINARY,
      hooksDir,
      logger,
    });
  }

  function renderRootAgent(): void {
    mkdirSync(workspace.agentsOutDir, { recursive: true });
    writeFileSync(join(workspace.agentsOutDir, "scientist.md"), "---\nname: scientist\n---\nbody\n");
  }

  function settings(): {
    hooks: Record<string, Array<{ hooks: Array<{ command: string }> }>>;
    permissions: unknown;
  } {
    return JSON.parse(readFileSync(join(workspace.stageDir, "claude-settings.json"), "utf-8"));
  }

  describe("run", () => {
    it("runs the pinned claude headless in the stage's workspace, in dontAsk mode with Ralph's host settings", async () => {
      // Arrange
      renderRootAgent();

      // Act
      await createExecutor().run("analyse the run");

      // Assert
      const { file, args, options } = spawned();
      expect(file).toBe(BINARY);
      expect(options).toMatchObject({ cwd: workspace.cwd, timeout: 5000 });
      const sessionId = args[args.indexOf("--session-id") + 1];
      expect(sessionId).toMatch(UUID);
      expect(args).toEqual([
        "-p",
        "--output-format",
        "stream-json",
        "--verbose",
        "--agent",
        "scientist",
        "--model",
        "opus",
        "--setting-sources",
        "user",
        "--settings",
        join(workspace.stageDir, "claude-settings.json"),
        "--strict-mcp-config",
        "--permission-mode",
        "dontAsk",
        "--tools",
        "Read,Write,Edit,Bash,Skill,TaskCreate,TaskGet,TaskList,TaskUpdate,Agent",
        "--add-dir",
        join(root, "output", "DF-100-1"),
        "--add-dir",
        join(orchestratorDir, "profiles", "docs", "agents"),
        "--add-dir",
        join(orchestratorDir, "shared", "skills"),
        "--session-id",
        sessionId,
        "--debug-file",
        join(workspace.logDir, "claude.log"),
      ]);
    });

    it("passes the prompt on stdin, not on the command line", async () => {
      // Arrange
      renderRootAgent();

      // Act
      await createExecutor().run("a prompt longer than any argument should carry");

      // Assert
      const { args, options } = spawned();
      expect(options.input).toBe("a prompt longer than any argument should carry");
      expect(args.join(" ")).not.toContain("a prompt longer");
    });

    it("leaves Agent out of the tools for a root without subagents", async () => {
      // Arrange
      renderRootAgent();

      // Act
      await createExecutor({ subagentDepth: 0 }).run("p");

      // Assert
      const { args, options } = spawned();
      expect(args[args.indexOf("--tools") + 1]).toBe(
        "Read,Write,Edit,Bash,Skill,TaskCreate,TaskGet,TaskList,TaskUpdate",
      );
      expect(options.env).not.toHaveProperty("CLAUDE_CODE_MAX_SUBAGENT_SPAWN_DEPTH");
    });

    it("gives the CLI a private home and only the configured credential, never the orchestrator's other secrets", async () => {
      // Arrange
      renderRootAgent();
      vi.stubEnv("CLAUDE_CODE_OAUTH_TOKEN", "oauth-token");
      vi.stubEnv("ANTHROPIC_API_KEY", "api-key");
      vi.stubEnv("ADO_PAT", "ado-secret");
      vi.stubEnv("JIRA_PAT_DOCS", "jira-secret");
      vi.stubEnv("JIRA_EMAIL_DOCS", "ralph@example.com");
      vi.stubEnv("GH_TOKEN", "gh-secret");
      vi.stubEnv("DISCORD_BOT_TOKEN", "discord-secret");

      // Act
      await createExecutor().run("p");

      // Assert
      const { options } = spawned();
      expect(options.extendEnv).toBe(false);
      const env = options.env as Record<string, string>;
      expect(env).toMatchObject({
        CLAUDE_CONFIG_DIR: workspace.cliHomeDir,
        CLAUDE_CODE_OAUTH_TOKEN: "oauth-token",
        CLAUDE_CODE_DISABLE_CLAUDE_MDS: "1",
        CLAUDE_CODE_DISABLE_BACKGROUND_TASKS: "1",
        CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC: "1",
        RALPH_LOG_DIR: workspace.logDir,
        CLAUDE_CODE_MAX_SUBAGENT_SPAWN_DEPTH: "1",
      });
      expect(Object.keys(env).filter((name) => /^(ADO_PAT|JIRA_|GH_TOKEN|DISCORD|ANTHROPIC)/.test(name))).toEqual([]);
      expect(JSON.stringify(env)).not.toMatch(/ado-secret|jira-secret|gh-secret|discord-secret|api-key/);
    });

    it("authenticates with the API key when claudeAuth is api-key", async () => {
      // Arrange
      renderRootAgent();
      vi.stubEnv("CLAUDE_CODE_OAUTH_TOKEN", "oauth-token");
      vi.stubEnv("ANTHROPIC_API_KEY", "api-key");

      // Act
      await createExecutor({ claudeAuth: ClaudeAuthMode.ApiKey }).run("p");

      // Assert
      const env = spawned().options.env as Record<string, string>;
      expect(env.ANTHROPIC_API_KEY).toBe("api-key");
      expect(env).not.toHaveProperty("CLAUDE_CODE_OAUTH_TOKEN");
    });

    it("asks a stage that requires a result for it as structured output, on a resumed session too", async () => {
      // Arrange
      renderRootAgent();
      const executor = createExecutor({ stage: { requireResultBlock: true } });

      // Act
      await executor.run("p");
      await executor.continueSession("keep going");

      // Assert
      for (const call of [0, 1]) {
        const { args } = spawned(call);
        expect(args[args.indexOf("--json-schema") + 1]).toBe(AGENT_RESULT_JSON_SCHEMA);
      }
      expect(spawned(1).args).toContain("--resume");
    });

    it("runs Ralph's audit hooks from the host's shared/hooks under the stage's host permissions", async () => {
      // Arrange
      renderRootAgent();

      // Act
      await createExecutor().run("p");

      // Assert
      const { hooks, permissions } = settings();
      expect(hooks.SessionStart[0].hooks[0].command).toBe(`'${hooksDir}/log-session-start.sh' --cli claude`);
      expect(hooks.SessionEnd[0].hooks[0].command).toBe(`'${hooksDir}/log-session-end.sh' --cli claude`);
      expect(permissions).toEqual(hostPermissionRules(workspace, ["run-analyzer", "agent-improver"]));
    });

    it("writes nothing outside the stage's workspace", async () => {
      // Arrange
      renderRootAgent();

      // Act
      await createExecutor().run("p");

      // Assert
      expect(readdirSync(orchestratorDir)).toEqual(["shared"]);
      for (const dir of [workspace.cwd, workspace.cliHomeDir, workspace.logDir]) expect(existsSync(dir)).toBe(true);
    });

    it("throws without running claude when the stage root's agent was not rendered into the workspace", async () => {
      // Act & Assert
      await expect(createExecutor().run("p")).rejects.toThrow(
        `Rendered agent ${join(workspace.agentsOutDir, "scientist.md")} not found`,
      );
      expect(execa).not.toHaveBeenCalled();
    });

    it("returns a CLI crash as a non-zero exit with the error Claude Code reported", async () => {
      // Arrange
      renderRootAgent();
      const stream = line({
        type: "result",
        subtype: "success",
        is_error: true,
        result: "Not logged in · Please run /login",
        terminal_reason: "api_error",
      });
      const error = Object.assign(Object.create(ExecaError.prototype) as ExecaError, {
        exitCode: 1,
        timedOut: false,
        stdout: stream,
        stderr: "",
        shortMessage: "Command failed with exit code 1",
      });
      vi.mocked(execa).mockImplementation(hostStageProcesses(() => fakeCliProcess(stream, { exitCode: 1, error })));

      // Act
      const result = await createExecutor().run("p");

      // Assert
      expect(result.exitCode).toBe(1);
      expect(result.cliError).toEqual({ subtype: "api_error", message: "Not logged in · Please run /login" });
    });

    it("throws without running claude when Ralph's hooks.json is missing", async () => {
      // Arrange
      renderRootAgent();
      rmSync(join(hooksDir, "claude", "hooks.json"));

      // Act & Assert
      await expect(createExecutor().run("p")).rejects.toThrow(
        `Failed to read Claude Code hooks from ${join(hooksDir, "claude", "hooks.json")}`,
      );
      expect(vi.mocked(execa).mock.calls.filter(([command]) => command === BINARY)).toEqual([]);
    });

    it("returns a claude binary that is missing as a run that exited 1, warning with the spawn error", async () => {
      // Arrange
      renderRootAgent();
      const actual = await vi.importActual<typeof import("execa")>("execa");
      vi.mocked(execa).mockImplementation(actual.execa);

      // Act
      const result = await createExecutor().run("p");

      // Assert
      expect(result).toMatchObject({ exitCode: 1, stdout: "", timedOut: false });
      expect(logger.warn).toHaveBeenCalledWith(expect.stringContaining(`Command failed with ENOENT: ${BINARY}`));
    });
  });

  describe("continueSession", () => {
    it("resumes the session run started, with Ralph's settings and the continuation prompt on stdin", async () => {
      // Arrange
      renderRootAgent();
      const executor = createExecutor();
      await executor.run("first");

      // Act
      await executor.continueSession("keep going");

      // Assert
      const first = spawned(0).args;
      const second = spawned(1);
      expect(second.args[second.args.indexOf("--resume") + 1]).toBe(first[first.indexOf("--session-id") + 1]);
      expect(second.args).not.toContain("--session-id");
      expect(second.args).toContain("--settings");
      expect(second.options.input).toBe("keep going");
    });

    it("starts a new session when none was started", async () => {
      // Arrange
      renderRootAgent();

      // Act
      await createExecutor().continueSession("keep going");

      // Assert
      expect(spawned().args).toContain("--session-id");
      expect(spawned().args).not.toContain("--resume");
    });
  });
});
