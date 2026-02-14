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
    const source = await readSource("../src/container/copilot-executor.ts");
    expect(source).toContain('"--model"');
    expect(source).toContain('"claude-opus-4.6"');
  });

  it("includes --yolo and --experimental flags", async () => {
    const source = await readSource("../src/container/copilot-executor.ts");
    expect(source).toContain('"--yolo"');
    expect(source).toContain('"--experimental"');
  });

  it("includes --share flag for session transcript export", async () => {
    const source = await readSource("../src/container/copilot-executor.ts");
    expect(source).toContain('"--share"');
    expect(source).toContain("TRANSCRIPT_PATH");
  });
});

describe("Claude Code CLI args", () => {
  it("includes --dangerously-skip-permissions flag", async () => {
    const source = await readSource("../src/container/claude-code-executor.ts");
    expect(source).toContain('"--dangerously-skip-permissions"');
  });

  it("supports optional --model flag", async () => {
    const source = await readSource("../src/container/claude-code-executor.ts");
    expect(source).toContain('"--model"');
    expect(source).toContain("profile.model");
  });
});

describe("Compose environment", () => {
  it("injects all required env vars into compose process", async () => {
    const source = await readSource("../src/container/compose-client.ts");
    const requiredEnvVars = [
      "GH_TOKEN",
      "ADO_PAT_DOCS",
      "ADO_MCP_AUTH_TOKEN",
      "ADO_PAT_XPERIENCE",
      "JIRA_PAT",
      "JIRA_EMAIL",
      "JIRA_BASE_URL",
      "JIRA_CLOUD_ID",
      "ANTHROPIC_API_KEY",
    ];
    for (const envVar of requiredEnvVars) {
      expect(source).toContain(envVar);
    }
  });
});

describe("CLI selection", () => {
  it("manager supports both copilot and claude executors", async () => {
    const source = await readSource("../src/container/manager.ts");
    expect(source).toContain("CopilotExecutor");
    expect(source).toContain("ClaudeCodeExecutor");
    expect(source).toContain("selectExecutor");
  });

  it("falls back when preferred CLI credential is missing", async () => {
    const source = await readSource("../src/container/manager.ts");
    expect(source).toContain("falling back to Copilot CLI");
    expect(source).toContain("falling back to Claude Code CLI");
  });
});

describe("Docker compose options", () => {
  it("uses --remove-orphans in docker compose down", async () => {
    const source = await readSource("../src/container/manager.ts");
    expect(source).toContain('"--remove-orphans"');
  });
});

describe("Build streaming", () => {
  it("streams build and setup output via StreamCapture", async () => {
    const source = await readSource("../src/container/manager.ts");
    expect(source).toContain('new StreamCapture(proc, this.logger, "build")');
    expect(source).toContain('new StreamCapture(setupProc, this.logger, "setup")');
  });
});
