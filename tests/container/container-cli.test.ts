import { describe, it, expect } from "vitest";

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
  it("force-removes both app and egress-proxy containers on compose failure", async () => {
    const source = await readSource("../../src/container/manager.ts");
    expect(source).toContain('"egress-proxy"');
    // Both services should be in the fallback loop
    expect(source).toMatch(/for\s*\(.*\["app",\s*"egress-proxy"\]/);
  });
});
