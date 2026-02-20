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

  it("declares proxy domains for Azure DevOps", () => {
    const manifest = loadManifest();
    expect(manifest.proxyDomains).toEqual(
      expect.arrayContaining([".dev.azure.com"]),
    );
  });

  it("lists all five tool names", () => {
    const manifest = loadManifest();
    expect(manifest.tools).toEqual([
      "ado_create_pull_request",
      "ado_list_pull_requests",
      "ado_list_pull_request_threads",
      "ado_create_pull_request_thread",
      "ado_reply_to_comment",
    ]);
  });
});

describe("ADO MCP Server source", () => {
  it("defines all five tools", () => {
    const source = readAllSources();
    for (const tool of [
      "ado_create_pull_request",
      "ado_list_pull_requests",
      "ado_list_pull_request_threads",
      "ado_create_pull_request_thread",
      "ado_reply_to_comment",
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

  it("uses axios with https-proxy-agent for HTTP requests", () => {
    const source = readAllSources();
    expect(source).toContain("import axios");
    expect(source).toContain("HttpsProxyAgent");
    expect(source).toContain("proxy: false");
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
