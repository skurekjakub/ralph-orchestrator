import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { execa, ExecaError } from "execa";
import { LocalClaudeCodeExecutor } from "../../../src/container/cli-executors/local-claude-code-executor";
import { ClaudeCodeRuntime } from "../../../src/cli/claude/claude-runtime";
import { ClaudeAuthMode, CliType, StageMode, type IStageConfig } from "../../../src/config/types";
import type { HostStageWorkspace } from "../../../src/container/types";
import { makeHostWorkspace, makeProfile, makeStage } from "../../helpers/factories";
import { createMockLogger, fakeCliProcess } from "../../helpers/mocks";

vi.mock("execa", async (importOriginal) => {
  const orig = await importOriginal<typeof import("execa")>();
  return { ...orig, execa: vi.fn() };
});

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

/** The arguments and options of the n-th CLI process. */
function spawned(call = 0): { file: string; args: string[]; options: Record<string, unknown> } {
  const [file, args, options] = vi.mocked(execa).mock.calls[call] as unknown as [
    string,
    string[],
    Record<string, unknown>,
  ];
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
        Stop: [{ hooks: [{ type: "command", command: "/workspace/.ralph/hooks/claude/result-gate.sh" }] }],
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
      additionalDirs: [outputDir, join(orchestratorDir, "profiles"), join(orchestratorDir, "shared")],
    });

    vi.mocked(execa).mockReset();
    vi.mocked(execa).mockImplementation((() =>
      fakeCliProcess(
        line({ type: "result", subtype: "success", is_error: false, result: "done" }),
      )) as unknown as typeof execa);
  });

  afterEach(() => {
    process.chdir(originalCwd);
    vi.unstubAllEnvs();
    rmSync(root, { recursive: true, force: true });
  });

  function createExecutor(
    options: { stage?: Partial<IStageConfig>; claudeAuth?: ClaudeAuthMode; subagentDepth?: number } = {},
  ): LocalClaudeCodeExecutor {
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
      binary: "/repo/node_modules/.bin/claude",
      hooksDir,
      logger: createMockLogger(),
    });
  }

  function renderRootAgent(): void {
    mkdirSync(workspace.agentsOutDir, { recursive: true });
    writeFileSync(join(workspace.agentsOutDir, "scientist.md"), "---\nname: scientist\n---\nbody\n");
  }

  function settings(): {
    hooks: Record<string, Array<{ hooks: Array<{ command: string }> }>>;
    permissions: { allow: string[]; deny: string[] };
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
      expect(file).toBe("/repo/node_modules/.bin/claude");
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
        workspace.additionalDirs[0],
        "--add-dir",
        join(orchestratorDir, "profiles"),
        "--add-dir",
        join(orchestratorDir, "shared"),
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
        RALPH_REQUIRE_RESULT_BLOCK: "0",
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

    it("turns the result gate on for a stage that requires a result block", async () => {
      // Arrange
      renderRootAgent();

      // Act
      await createExecutor({ stage: { requireResultBlock: true } }).run("p");

      // Assert
      expect(spawned().options.env).toMatchObject({ RALPH_REQUIRE_RESULT_BLOCK: "1" });
    });

    it("runs Ralph's audit hooks from the host's shared/hooks and lets the stage write only in its workspace", async () => {
      // Arrange
      renderRootAgent();

      // Act
      await createExecutor().run("p");

      // Assert
      const { hooks, permissions } = settings();
      expect(hooks.SessionStart[0].hooks[0].command).toBe(`'${hooksDir}/log-session-start.sh' --cli claude`);
      expect(hooks.Stop[0].hooks[0].command).toBe(`'${hooksDir}/claude/result-gate.sh'`);
      const edits = permissions.allow.filter((rule) => rule.startsWith("Edit("));
      expect(edits).toEqual([`Edit(/${workspace.cwd}/**)`, `Edit(/${workspace.artifactDir}/**)`]);
      expect(permissions.allow).toEqual(expect.arrayContaining(["Agent(run-analyzer)", "Agent(agent-improver)"]));
      expect(permissions.deny).toEqual([`Read(/${join(orchestratorDir, ".env")})`]);
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
        `Rendered Claude Code agent ${join(workspace.agentsOutDir, "scientist.md")} not found`,
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
      vi.mocked(execa).mockImplementation((() =>
        fakeCliProcess(stream, { exitCode: 1, error })) as unknown as typeof execa);

      // Act
      const result = await createExecutor().run("p");

      // Assert
      expect(result.exitCode).toBe(1);
      expect(result.cliError).toBeDefined();
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
