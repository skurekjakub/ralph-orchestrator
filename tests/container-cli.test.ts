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
  it("includes --model claude-opus-4.6", async () => {
    const source = await readSource("../src/container/copilot-executor.ts");
    expect(source).toContain('"--model"');
    expect(source).toContain('"claude-opus-4.6"');
  });

  it("includes --yolo and --experimental flags", async () => {
    const source = await readSource("../src/container/copilot-executor.ts");
    expect(source).toContain('"--yolo"');
    expect(source).toContain('"--experimental"');
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
    ];
    for (const envVar of requiredEnvVars) {
      expect(source).toContain(envVar);
    }
  });
});

describe("Docker compose options", () => {
  it("uses --remove-orphans in docker compose down", async () => {
    const source = await readSource("../src/container/manager.ts");
    expect(source).toContain('"--remove-orphans"');
  });
});

describe("Build streaming", () => {
  it("streams build output to logger with [build] prefix", async () => {
    const source = await readSource("../src/container/manager.ts");
    expect(source).toContain("[build]");
    expect(source).toContain("proc.stdout");
    expect(source).toContain("proc.stderr");
  });
});
