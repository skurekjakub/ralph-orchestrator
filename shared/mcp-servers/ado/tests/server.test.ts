import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";

const manifestPath = resolve(import.meta.dirname, "../mcp-server.json");
const srcDir = resolve(import.meta.dirname, "../src");

function loadManifest() {
  return JSON.parse(readFileSync(manifestPath, "utf-8"));
}

/** Read all .ts source files (recursively) and concatenate them. */
function readAllSources() {
  const files: string[] = [];
  function walk(dir: string) {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if (entry.isDirectory()) walk(resolve(dir, entry.name));
      else if (entry.name.endsWith(".ts")) files.push(resolve(dir, entry.name));
    }
  }
  walk(srcDir);
  return files.map((f) => readFileSync(f, "utf-8")).join("\n");
}

describe("ADO MCP Server manifest", () => {
  it("declares correct server metadata", () => {
    const manifest = loadManifest();
    expect(manifest.name).toBe("ado");
    expect(manifest.type).toBe("custom");
    expect(manifest.command).toBe("node");
    expect(manifest.args).toEqual(["dist/bundle.js"]);
    expect(manifest.containerPath).toBe("/opt/mcp/servers/ado");
  });

  it("requires ADO_PAT env var", () => {
    const manifest = loadManifest();
    expect(manifest.requiredEnv).toEqual(["ADO_PAT"]);
  });

  it("lists all six tool names", () => {
    const manifest = loadManifest();
    expect(manifest.tools).toEqual([
      "ado_create_pull_request",
      "ado_list_pull_requests",
      "ado_list_pull_request_threads",
      "ado_create_pull_request_thread",
      "ado_reply_to_comment",
      "ado_push_progress",
    ]);
  });
});

describe("ADO MCP Server source", () => {
  it("defines all six tools", () => {
    const source = readAllSources();
    for (const tool of [
      "ado_create_pull_request",
      "ado_list_pull_requests",
      "ado_list_pull_request_threads",
      "ado_create_pull_request_thread",
      "ado_reply_to_comment",
      "ado_push_progress",
    ]) {
      expect(source).toContain(`"${tool}"`);
    }
  });

  it("validates ADO_PAT env var at startup", () => {
    const source = readAllSources();
    expect(source).toContain("process.env.ADO_PAT");
  });

  it("uses Basic auth with empty username and PAT", () => {
    const source = readAllSources();
    expect(source).toContain("Basic");
    expect(source).toContain(":${ADO_PAT}");
  });

  it("targets KenticoCustomerSuccess org", () => {
    const source = readAllSources();
    expect(source).toContain("KenticoCustomerSuccess");
    expect(source).toContain("dev.azure.com");
  });

  it("uses API version 7.1", () => {
    const source = readAllSources();
    expect(source).toContain("api-version");
    expect(source).toContain("7.1");
  });

  it("uses axios for HTTP requests without proxy configuration", () => {
    const source = readAllSources();
    expect(source).toContain("import axios");
    // Sidecar has direct internet access — no proxy agent needed
    expect(source).not.toContain("HttpsProxyAgent");
    expect(source).not.toContain("proxy: false");
  });

  it("encodes project and repo in URL paths", () => {
    const source = readAllSources();
    expect(source).toContain("encodeURIComponent(project)");
    expect(source).toContain("encodeURIComponent(repositoryId)");
  });

  it("returns isError on failures", () => {
    const source = readAllSources();
    expect(source).toContain("isError: true");
  });

  it("sanitizes text content in tools that accept user input", () => {
    const source = readAllSources();
    // All three tools with text content should use sanitizeContent
    expect(source).toContain("sanitizeContent");
    // Verify it's imported and used in the handler, not just defined
    const sanitizeCount = (source.match(/sanitizeContent\(/g) ?? []).length;
    // 1 definition + 3 tool usages = at least 4
    expect(sanitizeCount).toBeGreaterThanOrEqual(4);
  });
});

describe("ADO MCP Server git tools", () => {
  it("defines push_progress tool", () => {
    const source = readAllSources();
    expect(source).toContain('"ado_push_progress"');
  });

  it("uses REPO_ROOT env var for git operations", () => {
    const source = readAllSources();
    expect(source).toContain("process.env.REPO_ROOT");
    expect(source).toContain("REPO_ROOT");
  });

  it("uses gitExec helper for git operations", () => {
    const source = readAllSources();
    expect(source).toContain("gitExec");
    // gitExec definition + gitStageCommitPush usage (add, commit, push)
    const gitExecCount = (source.match(/gitExec\(/g) ?? []).length;
    expect(gitExecCount).toBeGreaterThanOrEqual(3);
  });

  it("sets GIT_TERMINAL_PROMPT=0 to prevent auth hangs", () => {
    const source = readAllSources();
    expect(source).toContain("GIT_TERMINAL_PROMPT");
  });

  it("uses force-with-lease for push safety", () => {
    const source = readAllSources();
    expect(source).toContain("force-with-lease");
  });

  it("sanitizes ADO_PAT from error messages in gitExec", () => {
    const source = readAllSources();
    expect(source).toContain(".replaceAll(ADO_PAT");
  });
});

describe("ADO MCP Server conditional schemas", () => {
  it("reads task-scoped env vars from process.env", () => {
    const source = readAllSources();
    expect(source).toContain("process.env.ADO_PROJECT");
    expect(source).toContain("process.env.ADO_REPO");
    expect(source).toContain("process.env.TASK_BRANCH");
  });

  it("conditionally includes project and repositoryId in schemas", () => {
    const source = readAllSources();
    expect(source).toContain("TASK_PROJECT");
    expect(source).toContain("TASK_REPO");
    // All 5 tools should check TASK_PROJECT and TASK_REPO
    const projectChecks = (source.match(/TASK_PROJECT/g) ?? []).length;
    const repoChecks = (source.match(/TASK_REPO/g) ?? []).length;
    // 1 definition in shared.ts + 5 imports + 5 schema checks + 5 handler defaults = ~16 each
    expect(projectChecks).toBeGreaterThanOrEqual(10);
    expect(repoChecks).toBeGreaterThanOrEqual(10);
  });

  it("uses TASK_BRANCH for sourceRefName defaulting in create and list tools", () => {
    const source = readAllSources();
    // TASK_BRANCH is used in shared.ts + create-pull-request + list-pull-requests
    const branchRefs = (source.match(/TASK_BRANCH/g) ?? []).length;
    expect(branchRefs).toBeGreaterThanOrEqual(5);
    // refs/heads/ prefix is used when TASK_BRANCH is present
    expect(source).toContain("refs/heads/${TASK_BRANCH}");
  });

  it("exports requiredConfig in manifest", () => {
    const manifest = loadManifest();
    expect(manifest.requiredConfig).toEqual(["ADO_PROJECT", "ADO_REPO"]);
  });
});
