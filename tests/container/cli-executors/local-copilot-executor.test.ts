import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { existsSync, lstatSync, mkdirSync, mkdtempSync, readlinkSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { execa } from "execa";
import { LocalCopilotExecutor } from "../../../src/container/cli-executors/local-copilot-executor";
import { makeProfile } from "../../helpers/factories";
import { createMockLogger, fakeCliProcess } from "../../helpers/mocks";

vi.mock("execa", async (importOriginal) => {
  const orig = await importOriginal<typeof import("execa")>();
  return { ...orig, execa: vi.fn() };
});

describe("LocalCopilotExecutor", () => {
  let root: string;
  let agentsBuild: string;

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), "local-copilot-"));
    agentsBuild = join(root, "profiles", "docs", ".build", "copilot", "agents");
    vi.mocked(execa).mockReset();
    vi.mocked(execa).mockImplementation((() => fakeCliProcess("done\n")) as unknown as typeof execa);
  });

  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
  });

  function createExecutor(): LocalCopilotExecutor {
    const profile = makeProfile({ id: "docs", agentName: "ralph.scientist", repoPath: "/target" });
    return new LocalCopilotExecutor(profile, root, createMockLogger());
  }

  function renderAgent(fileName: string): void {
    mkdirSync(agentsBuild, { recursive: true });
    writeFileSync(join(agentsBuild, fileName), "---\nname: x\n---\nbody\n");
  }

  it("links the rendered agents into <cwd>/.github/agents for the run and removes the links afterwards", async () => {
    // Arrange
    renderAgent("ralph.scientist.agent.md");
    renderAgent("ralph.helper.agent.md");
    const linked: string[] = [];
    vi.mocked(execa).mockImplementation(((_file: string, _args: string[], options: { cwd: string }) => {
      const link = join(options.cwd, ".github", "agents", "ralph.helper.agent.md");
      if (lstatSync(link).isSymbolicLink()) linked.push(readlinkSync(link));
      return fakeCliProcess("done\n");
    }) as unknown as typeof execa);

    // Act
    const result = await createExecutor().run("prompt");

    // Assert
    expect(result.exitCode).toBe(0);
    expect(linked).toEqual([join(agentsBuild, "ralph.helper.agent.md")]);
    expect(existsSync(join(root, ".github", "agents", "ralph.helper.agent.md"))).toBe(false);
    expect(vi.mocked(execa).mock.calls[0][1]).toEqual(expect.arrayContaining(["--agent", "ralph.scientist"]));
  });

  it("throws without running Copilot when the profile has no rendered Copilot agents", async () => {
    // Act & Assert
    await expect(createExecutor().run("prompt")).rejects.toThrow(
      `Rendered Copilot agent ${join(agentsBuild, "ralph.scientist.agent.md")} not found`,
    );
    expect(execa).not.toHaveBeenCalled();
  });

  it("throws without running Copilot when the stage root's agent was not rendered", async () => {
    // Arrange
    renderAgent("ralph.other.agent.md");

    // Act & Assert
    await expect(createExecutor().run("prompt")).rejects.toThrow(/ralph\.scientist\.agent\.md not found/);
    expect(execa).not.toHaveBeenCalled();
    expect(existsSync(join(root, ".github", "agents"))).toBe(false);
  });
});
