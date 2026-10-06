import { describe, it, expect, vi } from "vitest";
import { mkdirSync, writeFileSync } from "node:fs";
import { CopilotExecutor } from "../../src/container/cli-executors/copilot-executor.js";
import { ClaudeCodeExecutor } from "../../src/container/cli-executors/claude-code-executor.js";
import { DEFAULT_COPILOT_MODEL } from "../../src/cli/model-catalog.js";
import { CliType } from "../../src/config/types.js";
import type { CliPaths } from "../../src/container/types.js";
import { makeProfile } from "../helpers/factories.js";
import { createMockCompose, createMockLogger, fakeExecResult } from "../helpers/mocks.js";

vi.mock("node:fs", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:fs")>();
  return { ...actual, writeFileSync: vi.fn(), mkdirSync: vi.fn() };
});

/** Extract the `sh -c` shell command from the mocked exec args. */
function getShellCmd(compose: ReturnType<typeof createMockCompose>["compose"]): string {
  const args: string[] = vi.mocked(compose.execWithTimeout).mock.calls[0][0];
  expect(args.slice(0, 5)).toEqual(["--user", "vscode", "app", "sh", "-c"]);
  return args[5];
}

// ── CopilotExecutor.paths ────────────────────────────────────────────────────

describe("CopilotExecutor.paths", () => {
  it("exposes a CliPaths object with correct values", () => {
    const { compose } = createMockCompose();
    const executor = new CopilotExecutor(compose, makeProfile(), createMockLogger());

    const paths: CliPaths = executor.paths;

    expect(paths.configDir).toBe("/workspace/.ralph");
    expect(paths.transcriptPath).toBe("/workspace/.ralph/logs/session-transcript.md");
    expect(paths.logDir).toBe("/workspace/.ralph/logs/cli-debug");
    expect(paths.writableDirs).toEqual([
      "/workspace/.ralph/logs",
      "/workspace/.ralph/logs/cli-debug",
      "/workspace/.ralph/session-state",
    ]);
  });
});

// ── ClaudeCodeExecutor.paths ─────────────────────────────────────────────────

describe("ClaudeCodeExecutor.paths", () => {
  it("exposes a CliPaths object with correct values", () => {
    const { compose } = createMockCompose();
    const executor = new ClaudeCodeExecutor(compose, makeProfile({ cli: CliType.Claude }), createMockLogger());

    const paths: CliPaths = executor.paths;

    expect(paths.configDir).toBe("/workspace/.ralph");
    expect(paths.transcriptPath).toBe("/workspace/.ralph/logs/session-transcript.md");
    expect(paths.logDir).toBe("/workspace/.ralph/logs/cli-debug");
    expect(paths.writableDirs).toEqual([
      "/workspace/.ralph/logs",
      "/workspace/.ralph/logs/cli-debug",
      "/workspace/.ralph/session-state",
    ]);
  });
});

// ── CopilotExecutor ──────────────────────────────────────────────────────────

describe("CopilotExecutor.run", () => {
  function createExecutor(profileOverrides: Parameters<typeof makeProfile>[0] = {}) {
    const { compose } = createMockCompose();
    const logger = createMockLogger();
    const profile = makeProfile(profileOverrides);

    vi.mocked(compose.execWithTimeout).mockResolvedValue(
      fakeExecResult({
        exitCode: 0,
        stdout: "done",
        stderr: "",
        on: () => {},
      }),
    );

    const executor = new CopilotExecutor(compose, profile, logger);
    return { executor, compose, profile };
  }

  it("passes --disable-builtin-mcps when githubMcpTools is false", async () => {
    const { executor, compose } = createExecutor({ githubMcpTools: false });

    await executor.run("test prompt");

    const shellCmd = getShellCmd(compose);
    expect(shellCmd).toContain("--disable-builtin-mcps");
    expect(shellCmd).not.toContain("--add-github-mcp-tool");
  });

  it("passes --add-github-mcp-tool for each declared tool", async () => {
    const { executor, compose } = createExecutor({
      githubMcpTools: ["get_file_contents", "search_code"],
    });

    await executor.run("test prompt");

    const shellCmd = getShellCmd(compose);
    expect(shellCmd).not.toContain("--disable-builtin-mcps");
    expect(shellCmd).toContain("--add-github-mcp-tool get_file_contents");
    expect(shellCmd).toContain("--add-github-mcp-tool search_code");
  });

  it("uses profile model when set, DEFAULT_COPILOT_MODEL when not", async () => {
    const { executor: withModel, compose: c1 } = createExecutor({ model: "claude-sonnet-4" });
    const { executor: noModel, compose: c2 } = createExecutor({ model: undefined });

    await withModel.run("prompt");
    await noModel.run("prompt");

    expect(getShellCmd(c1)).toContain("--model claude-sonnet-4");
    expect(getShellCmd(c2)).toContain(`--model ${DEFAULT_COPILOT_MODEL}`);
  });

  it("writes prompt to file and reads via $(cat) instead of CLI arg", async () => {
    const { executor, compose, profile } = createExecutor();

    await executor.run("test prompt");

    expect(mkdirSync).toHaveBeenCalledWith(`${profile.repoPath}/.ralph`, { recursive: true });
    expect(writeFileSync).toHaveBeenCalledWith(`${profile.repoPath}/.ralph/prompt.txt`, "test prompt", "utf-8");
    const shellCmd = getShellCmd(compose);
    expect(shellCmd).toContain(`-p "$(cat ${CopilotExecutor.PROMPT_FILE})"`);
  });

  it("uses --continue flag in continueSession", async () => {
    const { executor, compose } = createExecutor();

    await executor.continueSession("continue working");

    const shellCmd = getShellCmd(compose);
    expect(shellCmd).toContain("--continue --prompt");
    expect(shellCmd).toContain(`"$(cat ${CopilotExecutor.PROMPT_FILE})"`);
    expect(shellCmd).not.toMatch(/\b-p\b/);
  });

  it("shares common flags between run and continueSession", async () => {
    const { executor, compose } = createExecutor();

    await executor.continueSession("continuation prompt");

    const shellCmd = getShellCmd(compose);
    expect(shellCmd).toContain("--config-dir");
    expect(shellCmd).toContain("--agent");
    expect(shellCmd).toContain("--allow-all-tools");
    expect(shellCmd).toContain("--share");
  });
});

// ── ClaudeCodeExecutor ───────────────────────────────────────────────────────

describe("ClaudeCodeExecutor.run", () => {
  function createExecutor(profileOverrides: Parameters<typeof makeProfile>[0] = {}) {
    const { compose } = createMockCompose();
    const logger = createMockLogger();
    const profile = makeProfile({ cli: CliType.Claude, ...profileOverrides });

    vi.mocked(compose.execWithTimeout).mockResolvedValue(
      fakeExecResult({
        exitCode: 0,
        stdout: "done",
        stderr: "",
        on: () => {},
      }),
    );

    const executor = new ClaudeCodeExecutor(compose, profile, logger);
    return { executor, compose, profile };
  }

  it("reads prompt from file via $(cat) instead of inline arg", async () => {
    const { executor, compose, profile } = createExecutor();

    await executor.run("test prompt");

    expect(writeFileSync).toHaveBeenCalledWith(`${profile.repoPath}/.ralph/prompt.txt`, "test prompt", "utf-8");
    const shellCmd = getShellCmd(compose);
    expect(shellCmd).toContain(`-p "$(cat ${ClaudeCodeExecutor.PROMPT_FILE})"`);
  });

  it("includes --dangerously-skip-permissions flag", async () => {
    const { executor, compose } = createExecutor();

    await executor.run("test prompt");

    const shellCmd = getShellCmd(compose);
    expect(shellCmd).toContain("--dangerously-skip-permissions");
  });

  it("includes --mcp-config and --strict-mcp-config", async () => {
    const { executor, compose } = createExecutor();

    await executor.run("test prompt");

    const shellCmd = getShellCmd(compose);
    expect(shellCmd).toContain("--mcp-config /workspace/.ralph/mcp-config.json");
    expect(shellCmd).toContain("--strict-mcp-config");
  });

  it("includes --model when profile.model is set", async () => {
    const { executor, compose } = createExecutor({ model: "claude-sonnet-4" });

    await executor.run("test prompt");

    const shellCmd = getShellCmd(compose);
    expect(shellCmd).toContain("--model claude-sonnet-4");
  });

  it("omits --model when profile.model is not set", async () => {
    const { executor, compose } = createExecutor({ model: undefined });

    await executor.run("test prompt");

    const shellCmd = getShellCmd(compose);
    expect(shellCmd).not.toContain("--model");
  });
});

describe("ClaudeCodeExecutor.continueSession", () => {
  function createExecutor(profileOverrides: Parameters<typeof makeProfile>[0] = {}) {
    const { compose } = createMockCompose();
    const logger = createMockLogger();
    const profile = makeProfile({ cli: CliType.Claude, ...profileOverrides });

    vi.mocked(compose.execWithTimeout).mockResolvedValue(
      fakeExecResult({
        exitCode: 0,
        stdout: "done",
        stderr: "",
        on: () => {},
      }),
    );

    const executor = new ClaudeCodeExecutor(compose, profile, logger);
    return { executor, compose };
  }

  it("uses --continue flag", async () => {
    const { executor, compose } = createExecutor();

    await executor.continueSession("continue working");

    const shellCmd = getShellCmd(compose);
    expect(shellCmd).toContain("--continue");
  });

  it("reads prompt from file via -p $(cat)", async () => {
    const { executor, compose } = createExecutor();

    await executor.continueSession("continue working");

    const shellCmd = getShellCmd(compose);
    expect(shellCmd).toContain(`-p "$(cat ${ClaudeCodeExecutor.PROMPT_FILE})"`);
  });

  it("shares common flags with run()", async () => {
    const { executor, compose } = createExecutor();

    await executor.continueSession("continuation prompt");

    const shellCmd = getShellCmd(compose);
    expect(shellCmd).toContain("--dangerously-skip-permissions");
    expect(shellCmd).toContain("--mcp-config");
    expect(shellCmd).toContain("--strict-mcp-config");
  });
});
