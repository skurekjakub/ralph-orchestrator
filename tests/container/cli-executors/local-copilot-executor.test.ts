import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { existsSync, mkdirSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { execa, ExecaError } from "execa";
import { LocalCopilotExecutor } from "../../../src/container/cli-executors/local-copilot-executor";
import { CopilotRuntime } from "../../../src/cli/copilot/copilot-runtime";
import type { HostStageWorkspace } from "../../../src/container/types";
import { makeHostWorkspace, makeProfile } from "../../helpers/factories";
import { createMockLogger, fakeCliProcess } from "../../helpers/mocks";

vi.mock("execa", async (importOriginal) => {
  const orig = await importOriginal<typeof import("execa")>();
  return { ...orig, execa: vi.fn() };
});

/** The arguments and options of the n-th CLI process. */
function spawned(call = 0): { file: string; args: string[]; options: Record<string, unknown> } {
  const [file, args, options] = vi.mocked(execa).mock.calls[call] as unknown as [
    string,
    string[],
    Record<string, unknown>,
  ];
  return { file, args, options };
}

describe("LocalCopilotExecutor", () => {
  let root: string;
  let orchestratorDir: string;
  let workspace: HostStageWorkspace;
  let originalCwd: string;

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), "local-copilot-"));
    orchestratorDir = join(root, "orchestrator");
    mkdirSync(orchestratorDir);
    originalCwd = process.cwd();
    process.chdir(orchestratorDir);
    const stageDir = join(root, "output", "DF-100-1", "hooks", "run-analysis", "scientist");
    const dirs = { cwd: join(stageDir, "work"), cliHomeDir: join(stageDir, "home") };
    const { agentsDir, skillsDir } = new CopilotRuntime().hostRenderDirs(dirs);
    workspace = makeHostWorkspace({
      ...dirs,
      stageDir,
      logDir: join(stageDir, "logs"),
      agentsOutDir: agentsDir,
      skillsOutDir: skillsDir,
      orchestratorDir,
    });
    vi.mocked(execa).mockReset();
    vi.mocked(execa).mockImplementation((() => fakeCliProcess("done\n")) as unknown as typeof execa);
  });

  afterEach(() => {
    process.chdir(originalCwd);
    vi.unstubAllEnvs();
    rmSync(root, { recursive: true, force: true });
  });

  function createExecutor(): LocalCopilotExecutor {
    return new LocalCopilotExecutor({
      profile: makeProfile({ id: "docs", agentName: "ralph.scientist", timeoutMs: 5000 }),
      workspace,
      runtime: new CopilotRuntime(),
      binary: "/repo/node_modules/.bin/copilot",
      logger: createMockLogger(),
    });
  }

  function renderRootAgent(): void {
    mkdirSync(workspace.agentsOutDir, { recursive: true });
    writeFileSync(join(workspace.agentsOutDir, "ralph.scientist.agent.md"), "---\nname: scientist\n---\nbody\n");
  }

  it("runs the pinned Copilot CLI in the stage's workspace, with its home and logs there", async () => {
    // Arrange
    renderRootAgent();

    // Act
    const result = await createExecutor().run("analyse the run");

    // Assert
    expect(result.exitCode).toBe(0);
    const { file, args, options } = spawned();
    expect(file).toBe("/repo/node_modules/.bin/copilot");
    expect(options).toMatchObject({ cwd: workspace.cwd, timeout: 5000 });
    expect(args.join(" ")).toContain(`--config-dir ${workspace.cliHomeDir}`);
    expect(args.join(" ")).toContain(`--log-dir ${join(workspace.logDir, "cli-debug")}`);
    expect(args).toEqual(expect.arrayContaining(["--agent", "ralph.scientist", "-p", "analyse the run"]));
  });

  it("writes nothing outside the stage's workspace", async () => {
    // Arrange
    renderRootAgent();

    // Act
    await createExecutor().run("p");

    // Assert
    expect(readdirSync(orchestratorDir)).toEqual([]);
    for (const dir of [workspace.cwd, workspace.cliHomeDir, workspace.logDir]) expect(existsSync(dir)).toBe(true);
  });

  it("passes the CLI only PATH, HOME, LANG and GH_TOKEN of the orchestrator's environment", async () => {
    // Arrange
    renderRootAgent();
    vi.stubEnv("GH_TOKEN", "gh-token");
    vi.stubEnv("ADO_PAT", "ado-secret");
    vi.stubEnv("JIRA_PAT_DOCS", "jira-secret");
    vi.stubEnv("CLAUDE_CODE_OAUTH_TOKEN", "claude-secret");

    // Act
    await createExecutor().run("p");

    // Assert
    const { options } = spawned();
    expect(options.extendEnv).toBe(false);
    const env = options.env as Record<string, string>;
    expect(env.GH_TOKEN).toBe("gh-token");
    expect(Object.keys(env).sort()).toEqual(["PATH", "HOME", "LANG", "GH_TOKEN"].filter((name) => name in env).sort());
    expect(JSON.stringify(env)).not.toMatch(/ado-secret|jira-secret|claude-secret/);
  });

  it("resumes the stage's last session with the continuation prompt", async () => {
    // Arrange
    renderRootAgent();

    // Act
    await createExecutor().continueSession("keep going");

    // Assert
    expect(spawned().args).toEqual(expect.arrayContaining(["--continue", "--prompt", "keep going"]));
  });

  it("throws without running Copilot when the stage root's agent was not rendered into the workspace", async () => {
    // Act & Assert
    await expect(createExecutor().run("prompt")).rejects.toThrow(
      `Rendered Copilot agent ${join(workspace.agentsOutDir, "ralph.scientist.agent.md")} not found`,
    );
    expect(execa).not.toHaveBeenCalled();
  });

  it("returns a CLI crash as a non-zero exit with what it printed", async () => {
    // Arrange
    renderRootAgent();
    const error = Object.assign(Object.create(ExecaError.prototype) as ExecaError, {
      exitCode: 3,
      timedOut: false,
      stdout: "partial\n",
      stderr: "boom",
      shortMessage: "Command failed with exit code 3",
    });
    vi.mocked(execa).mockImplementation((() =>
      fakeCliProcess("partial\n", { stderr: "boom", error })) as unknown as typeof execa);

    // Act
    const result = await createExecutor().run("p");

    // Assert
    expect(result).toMatchObject({ exitCode: 3, stdout: "partial\n", stderr: "boom", timedOut: false });
  });
});
