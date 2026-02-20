import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const manifestPath = resolve(import.meta.dirname, "../mcp-server.json");
const sourcePath = resolve(import.meta.dirname, "../src/index.ts");

function loadManifest() {
  return JSON.parse(readFileSync(manifestPath, "utf-8"));
}

function readSource() {
  return readFileSync(sourcePath, "utf-8");
}

describe("JIRA MCP Server manifest", () => {
  it("declares correct server metadata", () => {
    const manifest = loadManifest();
    expect(manifest.name).toBe("jira-kentico");
    expect(manifest.type).toBe("custom");
    expect(manifest.command).toBe("node");
  });

  it("lists required JIRA env vars", () => {
    const manifest = loadManifest();
    expect(manifest.requiredEnv).toEqual(
      expect.arrayContaining(["JIRA_PAT", "JIRA_EMAIL"]),
    );
    expect(manifest.requiredEnv).not.toContain("JIRA_BASE_URL");
    expect(manifest.requiredEnv).not.toContain("JIRA_CLOUD_ID");
  });

  it("declares proxy domains for Atlassian Cloud", () => {
    const manifest = loadManifest();
    expect(manifest.proxyDomains).toEqual(
      expect.arrayContaining([".atlassian.com", ".atlassian.net"]),
    );
  });

  it("lists both tool names", () => {
    const manifest = loadManifest();
    expect(manifest.tools).toEqual(["jira_add_comment", "jira_add_attachment"]);
  });
});

describe("JIRA MCP Server source", () => {
  it("registers jira_add_comment tool", () => {
    const source = readSource();
    expect(source).toContain('registerTool("jira_add_comment"');
  });

  it("registers jira_add_attachment tool", () => {
    const source = readSource();
    expect(source).toContain('registerTool("jira_add_attachment"');
  });

  it("validates required env vars at startup", () => {
    const source = readSource();
    for (const envVar of ["JIRA_PAT", "JIRA_EMAIL"]) {
      expect(source).toContain(`process.env.${envVar}`);
    }
  });

  it("uses Basic auth with email:pat", () => {
    const source = readSource();
    expect(source).toContain("Basic");
    expect(source).toContain("JIRA_EMAIL");
    expect(source).toContain("JIRA_PAT");
  });

  it("constructs API base URL with hardcoded JIRA config", () => {
    const source = readSource();
    expect(source).toContain("api.atlassian.com/ex/jira");
    expect(source).toContain("/rest/api/2");
  });

  it("encodes issue key in URL path", () => {
    const source = readSource();
    expect(source).toContain("encodeURIComponent(issueKey)");
  });

  it("sets X-Atlassian-Token header for attachments", () => {
    const source = readSource();
    expect(source).toContain("X-Atlassian-Token");
    expect(source).toContain("no-check");
  });

  it("returns isError on non-OK responses", () => {
    const source = readSource();
    expect(source).toContain("isError: true");
  });

  it("uses axios for HTTP requests (proxy-aware)", () => {
    const source = readSource();
    expect(source).toContain("import axios");
    expect(source).toContain("axios.post");
    expect(source).not.toContain("setGlobalDispatcher");
  });
});
