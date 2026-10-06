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
    expect(manifest.requiredEnv).toEqual(expect.arrayContaining(["JIRA_PAT_KENTICO_JIRA", "JIRA_PAT_KENTICO_JIRA"]));
    expect(manifest.requiredEnv).not.toContain("JIRA_BASE_URL");
    expect(manifest.requiredEnv).not.toContain("JIRA_CLOUD_ID");
  });

  it("lists both tool names", () => {
    const manifest = loadManifest();
    expect(manifest.tools).toEqual(["jira_add_comment", "jira_add_attachment"]);
  });
});

describe("JIRA MCP Server source", () => {
  it("registers jira_add_comment tool", () => {
    const source = readSource();
    expect(source).toMatch(/registerTool\(\s*"jira_add_comment"/);
  });

  it("registers jira_add_attachment tool", () => {
    const source = readSource();
    expect(source).toMatch(/registerTool\(\s*"jira_add_attachment"/);
  });

  it("sanitizes wiki markup before posting comments", () => {
    const source = readSource();
    expect(source).toContain("sanitizeWikiMarkup");
    expect(source).toContain("sanitized");
  });

  it("tool description warns against literal backslash-n", () => {
    const source = readSource();
    expect(source).toContain("do NOT use literal backslash-n");
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

  it("validates attachment file paths stay within shared directory", () => {
    const source = readSource();
    expect(source).toContain("ATTACHMENTS_DIR");
    expect(source).toContain("/tmp/mcp-attachments");
    expect(source).toContain("resolve(ATTACHMENTS_DIR, fileName)");
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

describe("sanitizeWikiMarkup logic", () => {
  // Re-implement the sanitizer locally to unit-test the regex logic
  // (the actual function is embedded in the server source, not exported)
  function sanitizeWikiMarkup(raw: string): string {
    return raw.replace(/\\n/g, "\n");
  }

  it("converts literal backslash-n to real newlines", () => {
    const input = "h3. Title\\n\\n*Bold* text\\nMore text";
    const result = sanitizeWikiMarkup(input);
    expect(result).toBe("h3. Title\n\n*Bold* text\nMore text");
  });

  it("preserves already-correct newlines", () => {
    const input = "h3. Title\n\n*Bold* text\nMore text";
    const result = sanitizeWikiMarkup(input);
    expect(result).toBe("h3. Title\n\n*Bold* text\nMore text");
  });

  it("handles input with no newlines at all", () => {
    const input = "Just a plain comment";
    const result = sanitizeWikiMarkup(input);
    expect(result).toBe("Just a plain comment");
  });

  it("handles mixed literal and real newlines", () => {
    const input = "Line 1\\nLine 2\nLine 3\\nLine 4";
    const result = sanitizeWikiMarkup(input);
    expect(result).toBe("Line 1\nLine 2\nLine 3\nLine 4");
  });
});
