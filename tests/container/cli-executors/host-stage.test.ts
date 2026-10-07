import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { existsSync, mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execa } from "execa";
import { prepareHostStage } from "../../../src/container/cli-executors/host-stage";
import { CopilotRuntime } from "../../../src/cli/copilot/copilot-runtime";
import type { HostStageWorkspace } from "../../../src/container/types";
import { makeHostWorkspace } from "../../helpers/factories";

describe("prepareHostStage", () => {
  let checkout: string;
  let workspace: HostStageWorkspace;
  let rootAgentPath: string;

  beforeEach(async () => {
    checkout = realpathSync(mkdtempSync(join(tmpdir(), "host-stage-")));
    await execa("git", ["init", "--quiet"], { cwd: checkout });
    const stageDir = join(checkout, "output", "logs", "DF-100-1", "hooks", "run-analysis", "scientist");
    workspace = makeHostWorkspace({
      stageDir,
      cwd: join(stageDir, "work"),
      cliHomeDir: join(stageDir, "home"),
      logDir: join(stageDir, "logs"),
      agentsOutDir: join(stageDir, "work", ".github", "agents"),
      orchestratorDir: checkout,
    });
    rootAgentPath = join(workspace.agentsOutDir, "ralph.scientist.agent.md");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    rmSync(checkout, { recursive: true, force: true });
  });

  function renderRootAgent(): void {
    mkdirSync(workspace.agentsOutDir, { recursive: true });
    writeFileSync(rootAgentPath, "---\nname: scientist\n---\n");
  }

  it("makes the working directory a git repository of its own inside the orchestrator checkout's", async () => {
    // Arrange
    renderRootAgent();

    // Act
    await prepareHostStage(workspace, { rootAgentPath, runtime: new CopilotRuntime(), env: {} });

    // Assert
    const { stdout } = await execa("git", ["rev-parse", "--show-toplevel"], { cwd: workspace.cwd });
    expect(stdout).toBe(workspace.cwd);
  });

  it("creates the CLI home and the log directory", async () => {
    // Arrange
    renderRootAgent();

    // Act
    await prepareHostStage(workspace, { rootAgentPath, runtime: new CopilotRuntime(), env: {} });

    // Assert
    expect(existsSync(workspace.cliHomeDir)).toBe(true);
    expect(existsSync(workspace.logDir)).toBe(true);
  });

  it("returns PATH, HOME, LANG, the runtime's credential and the CLI's own variables, and no other secret", async () => {
    // Arrange
    renderRootAgent();
    vi.stubEnv("GH_TOKEN", "gh-token");
    vi.stubEnv("ADO_PAT", "ado-secret");

    // Act
    const env = await prepareHostStage(workspace, {
      rootAgentPath,
      runtime: new CopilotRuntime(),
      env: { COPILOT_HOME: workspace.cliHomeDir },
    });

    // Assert
    expect(env).toMatchObject({ GH_TOKEN: "gh-token", COPILOT_HOME: workspace.cliHomeDir });
    expect(
      Object.keys(env).filter((name) => !["PATH", "HOME", "LANG", "GH_TOKEN", "COPILOT_HOME"].includes(name)),
    ).toEqual([]);
  });

  it("throws without preparing the workspace when the stage's root agent was not rendered", async () => {
    // Act & Assert
    await expect(
      prepareHostStage(workspace, { rootAgentPath, runtime: new CopilotRuntime(), env: {} }),
    ).rejects.toThrow(`Rendered agent ${rootAgentPath} not found`);
    expect(existsSync(workspace.cwd)).toBe(false);
  });
});
