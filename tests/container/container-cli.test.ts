import { describe, it, expect, vi } from "vitest";
import { CopilotExecutor } from "../../src/container/cli-executors/copilot-executor.js";
import { DEFAULT_MODEL } from "../../src/config.js";
import { makeProfile } from "../helpers/factories.js";
import { createMockCompose, createMockLogger, fakeExecResult } from "../helpers/mocks.js";

// ── Container CLI args validation tests ──────────────────
// Validates that the container source code includes all required
// CLI flags, env vars, and docker compose options.

async function readSource(relPath: string): Promise<string> {
  const { readFileSync } = await import("node:fs");
  const { resolve } = await import("node:path");
  return readFileSync(resolve(import.meta.dirname, relPath), "utf-8");
}

describe("Copilot CLI args", () => {
  it("includes --model with configurable default", async () => {
    const source = await readSource("../../src/container/cli-executors/copilot-executor.ts");
    expect(source).toContain('"--model"');
    expect(source).toContain("DEFAULT_MODEL");
  });

  it("includes explicit permission flags instead of --yolo", async () => {
    const source = await readSource("../../src/container/cli-executors/copilot-executor.ts");
    expect(source).toContain('"--allow-all-tools"');
    expect(source).toContain('"--allow-all-paths"');
    expect(source).toContain('"--experimental"');
    expect(source).not.toContain('"--yolo"');
    expect(source).not.toContain('"--allow-all-urls"');
  });

  it("includes --share flag for session transcript export", async () => {
    const source = await readSource("../../src/container/cli-executors/copilot-executor.ts");
    expect(source).toContain('"--share"');
    expect(source).toContain("TRANSCRIPT_PATH");
  });

  it("supports configurable GitHub MCP server tool restrictions", async () => {
    const source = await readSource("../../src/container/cli-executors/copilot-executor.ts");
    expect(source).toContain('"--disable-builtin-mcps"');
    expect(source).toContain('"--add-github-mcp-tool"');
    expect(source).toContain("githubMcpTools");
  });
});

describe("Claude Code CLI args", () => {
  it("includes --dangerously-skip-permissions flag", async () => {
    const source = await readSource("../../src/container/cli-executors/claude-code-executor.ts");
    expect(source).toContain('"--dangerously-skip-permissions"');
  });

  it("supports optional --model flag", async () => {
    const source = await readSource("../../src/container/cli-executors/claude-code-executor.ts");
    expect(source).toContain('"--model"');
    expect(source).toContain("profile.model");
  });
});

describe("Compose environment", () => {
  it("injects computed paths into compose process", async () => {
    const source = await readSource("../../src/container/compose-client.ts");
    const requiredEnvVars = [
      "TARGET_REPO_PATH",
      "SHARED_HOOKS_PATH",
      "SQUID_CONF_PATH",
    ];
    for (const envVar of requiredEnvVars) {
      expect(source).toContain(envVar);
    }
  });
});

describe("Docker compose options", () => {
  it("uses --remove-orphans in docker compose down", async () => {
    const source = await readSource("../../src/container/manager.ts");
    expect(source).toContain('"--remove-orphans"');
  });
});

describe("Build streaming", () => {
  it("streams build and setup output via StreamCapture", async () => {
    const source = await readSource("../../src/container/manager.ts");
    expect(source).toContain('new StreamCapture(proc, this.containerLogger, "build")');
    expect(source).toContain('new StreamCapture(setupProc, this.containerLogger, "setup")');
  });
});

describe("Container stop fallback", () => {
  it("force-removes app, egress-proxy, and mcp-sidecar containers on compose failure", async () => {
    const source = await readSource("../../src/container/manager.ts");
    expect(source).toContain('"egress-proxy"');
    expect(source).toContain('"mcp-sidecar"');
    // All services should be in the fallback loop
    expect(source).toMatch(/for\s*\(.*\["app",\s*"egress-proxy",\s*"mcp-sidecar"\]/);
  });
});

describe("Log collection", () => {
  it("registers mcp-sidecar log source with useComposeLogs", async () => {
    const source = await readSource("../../src/container/manager.ts");
    expect(source).toContain('id: "sidecar"');
    expect(source).toContain('service: "mcp-sidecar"');
    expect(source).toContain("useComposeLogs: true");
  });

  it("compose client exposes logs() method for docker compose logs", async () => {
    const source = await readSource("../../src/container/compose-client.ts");
    expect(source).toContain('"logs"');
    expect(source).toContain('"--no-color"');
    expect(source).toContain('"--no-log-prefix"');
  });

  it("log collector supports useComposeLogs flag for stdout-based services", async () => {
    const source = await readSource("../../src/container/log-collector.ts");
    expect(source).toContain("useComposeLogs");
    expect(source).toContain("compose.logs(source.service)");
  });
});

// ── Behavioral tests — Copilot CLI executor ─────────────────────────────────

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
});
