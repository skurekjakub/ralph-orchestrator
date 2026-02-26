import { describe, it, expect, vi } from "vitest";
import { CopilotExecutor } from "../../src/container/cli-executors/copilot-executor.js";
import { ClaudeCodeExecutor } from "../../src/container/cli-executors/claude-code-executor.js";
import { DEFAULT_MODEL } from "../../src/config/constants.js";
import { CliType } from "../../src/container/types.js";
import type { CliPaths } from "../../src/container/types.js";
import { makeProfile } from "../helpers/factories.js";
import { createMockCompose, createMockLogger, fakeExecResult } from "../helpers/mocks.js";

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

    vi.mocked(compose.execWithTimeout).mockResolvedValue(fakeExecResult({
      exitCode: 0,
      stdout: "done",
      stderr: "",
      on: () => {},
    }));

    const executor = new CopilotExecutor(compose, profile, logger);
    return { executor, compose };
  }

  it("passes --disable-builtin-mcps when githubMcpTools is false", async () => {
    const { executor, compose } = createExecutor({ githubMcpTools: false });

    await executor.run("test prompt");

    const args: string[] = vi.mocked(compose.execWithTimeout).mock.calls[0][0];
    expect(args).toContain("--disable-builtin-mcps");
    expect(args).not.toContain("--add-github-mcp-tool");
  });

  it("passes --add-github-mcp-tool for each declared tool", async () => {
    const { executor, compose } = createExecutor({
      githubMcpTools: ["get_file_contents", "search_code"],
    });

    await executor.run("test prompt");

    const args: string[] = vi.mocked(compose.execWithTimeout).mock.calls[0][0];
    expect(args).not.toContain("--disable-builtin-mcps");
    const toolFlagIndices = args.reduce<number[]>((acc, a, i) => {
      if (a === "--add-github-mcp-tool") acc.push(i);
      return acc;
    }, []);
    expect(toolFlagIndices).toHaveLength(2);
    expect(args[toolFlagIndices[0] + 1]).toBe("get_file_contents");
    expect(args[toolFlagIndices[1] + 1]).toBe("search_code");
  });

  it("uses profile model when set, DEFAULT_MODEL when not", async () => {
    const { executor: withModel, compose: c1 } = createExecutor({ model: "claude-sonnet-4" });
    const { executor: noModel, compose: c2 } = createExecutor({ model: undefined });

    await withModel.run("prompt");
    await noModel.run("prompt");

    const args1: string[] = vi.mocked(c1.execWithTimeout).mock.calls[0][0];
    const args2: string[] = vi.mocked(c2.execWithTimeout).mock.calls[0][0];

    const modelIndex1 = args1.indexOf("--model");
    const modelIndex2 = args2.indexOf("--model");
    expect(args1[modelIndex1 + 1]).toBe("claude-sonnet-4");
    expect(args2[modelIndex2 + 1]).toBe(DEFAULT_MODEL);
  });

  it("uses --continue flag in continueSession", async () => {
    const { executor, compose } = createExecutor();

    await executor.continueSession("continue working");

    const args: string[] = vi.mocked(compose.execWithTimeout).mock.calls[0][0];
    expect(args).toContain("--continue");
    expect(args).toContain("--prompt");
    const promptIdx = args.indexOf("--prompt");
    expect(args[promptIdx + 1]).toBe("continue working");
    expect(args).not.toContain("-p");
  });

  it("shares common flags between run and continueSession", async () => {
    const { executor, compose } = createExecutor();

    await executor.continueSession("continuation prompt");

    const args: string[] = vi.mocked(compose.execWithTimeout).mock.calls[0][0];
    expect(args).toContain("--config-dir");
    expect(args).toContain("--agent");
    expect(args).toContain("--allow-all-tools");
    expect(args).toContain("--share");
  });
});

// ── ClaudeCodeExecutor ───────────────────────────────────────────────────────

describe("ClaudeCodeExecutor.run", () => {
  function createExecutor(profileOverrides: Parameters<typeof makeProfile>[0] = {}) {
    const { compose } = createMockCompose();
    const logger = createMockLogger();
    const profile = makeProfile({ cli: CliType.Claude, ...profileOverrides });

    vi.mocked(compose.execWithTimeout).mockResolvedValue(fakeExecResult({
      exitCode: 0,
      stdout: "done",
      stderr: "",
      on: () => {},
    }));

    const executor = new ClaudeCodeExecutor(compose, profile, logger);
    return { executor, compose };
  }

  it("passes prompt via -p flag", async () => {
    const { executor, compose } = createExecutor();

    await executor.run("test prompt");

    const args: string[] = vi.mocked(compose.execWithTimeout).mock.calls[0][0];
    const pIdx = args.indexOf("-p");
    expect(pIdx).toBeGreaterThan(-1);
    expect(args[pIdx + 1]).toBe("test prompt");
  });

  it("includes --dangerously-skip-permissions flag", async () => {
    const { executor, compose } = createExecutor();

    await executor.run("test prompt");

    const args: string[] = vi.mocked(compose.execWithTimeout).mock.calls[0][0];
    expect(args).toContain("--dangerously-skip-permissions");
  });

  it("includes --mcp-config and --strict-mcp-config", async () => {
    const { executor, compose } = createExecutor();

    await executor.run("test prompt");

    const args: string[] = vi.mocked(compose.execWithTimeout).mock.calls[0][0];
    expect(args).toContain("--mcp-config");
    expect(args).toContain("--strict-mcp-config");
    const mcpIdx = args.indexOf("--mcp-config");
    expect(args[mcpIdx + 1]).toBe("/workspace/.ralph/mcp-config.json");
  });

  it("includes --model when profile.model is set", async () => {
    const { executor, compose } = createExecutor({ model: "claude-sonnet-4" });

    await executor.run("test prompt");

    const args: string[] = vi.mocked(compose.execWithTimeout).mock.calls[0][0];
    const modelIdx = args.indexOf("--model");
    expect(modelIdx).toBeGreaterThan(-1);
    expect(args[modelIdx + 1]).toBe("claude-sonnet-4");
  });

  it("omits --model when profile.model is not set", async () => {
    const { executor, compose } = createExecutor({ model: undefined });

    await executor.run("test prompt");

    const args: string[] = vi.mocked(compose.execWithTimeout).mock.calls[0][0];
    expect(args).not.toContain("--model");
  });
});

describe("ClaudeCodeExecutor.continueSession", () => {
  function createExecutor(profileOverrides: Parameters<typeof makeProfile>[0] = {}) {
    const { compose } = createMockCompose();
    const logger = createMockLogger();
    const profile = makeProfile({ cli: CliType.Claude, ...profileOverrides });

    vi.mocked(compose.execWithTimeout).mockResolvedValue(fakeExecResult({
      exitCode: 0,
      stdout: "done",
      stderr: "",
      on: () => {},
    }));

    const executor = new ClaudeCodeExecutor(compose, profile, logger);
    return { executor, compose };
  }

  it("uses --continue flag", async () => {
    const { executor, compose } = createExecutor();

    await executor.continueSession("continue working");

    const args: string[] = vi.mocked(compose.execWithTimeout).mock.calls[0][0];
    expect(args).toContain("--continue");
  });

  it("passes prompt via -p flag", async () => {
    const { executor, compose } = createExecutor();

    await executor.continueSession("continue working");

    const args: string[] = vi.mocked(compose.execWithTimeout).mock.calls[0][0];
    const pIdx = args.indexOf("-p");
    expect(pIdx).toBeGreaterThan(-1);
    expect(args[pIdx + 1]).toBe("continue working");
  });

  it("shares common flags with run()", async () => {
    const { executor, compose } = createExecutor();

    await executor.continueSession("continuation prompt");

    const args: string[] = vi.mocked(compose.execWithTimeout).mock.calls[0][0];
    expect(args).toContain("--dangerously-skip-permissions");
    expect(args).toContain("--mcp-config");
    expect(args).toContain("--strict-mcp-config");
  });
});
