import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";

const manifestPath = resolve(import.meta.dirname, "../mcp-server.json");
const srcDir = resolve(import.meta.dirname, "../src");

function loadManifest() {
  return JSON.parse(readFileSync(manifestPath, "utf-8"));
}

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

describe("Ralphchives Read MCP Server manifest", () => {
  it("declares correct server metadata", () => {
    const manifest = loadManifest();
    expect(manifest.name).toBe("ralphchives-read");
    expect(manifest.type).toBe("custom");
    expect(manifest.command).toBe("node");
    expect(manifest.args).toEqual(["dist/bundle.js"]);
    expect(manifest.containerPath).toBe("/opt/mcp/servers/ralphchives-read");
  });

  it("assigns sidecar port 9107", () => {
    const manifest = loadManifest();
    expect(manifest.sidecarPort).toBe(9107);
  });

  it("requires NODEBB_API_URL env var", () => {
    const manifest = loadManifest();
    expect(manifest.requiredEnv).toEqual(["NODEBB_API_URL"]);
  });

  it("requires NODEBB_API_TOKEN and NODEBB_CATEGORY_NAME config", () => {
    const manifest = loadManifest();
    expect(manifest.requiredConfig).toEqual(["NODEBB_API_TOKEN", "NODEBB_CATEGORY_NAME"]);
  });

  it("lists all three tool names", () => {
    const manifest = loadManifest();
    expect(manifest.tools).toEqual(["search_ralphchives", "get_topic", "list_recent_topics"]);
  });
});

describe("Ralphchives Read MCP Server source", () => {
  it("defines all three tools", () => {
    const source = readAllSources();
    expect(source).toContain('"search_ralphchives"');
    expect(source).toContain('"get_topic"');
    expect(source).toContain('"list_recent_topics"');
  });

  it("validates NODEBB_API_TOKEN env var at startup", () => {
    const source = readAllSources();
    expect(source).toContain("process.env.NODEBB_API_TOKEN");
  });

  it("uses Bearer auth for NodeBB API", () => {
    const source = readAllSources();
    expect(source).toContain("Bearer");
    expect(source).toContain("Authorization");
  });

  it("uses GET requests (not POST) for read operations", () => {
    const source = readAllSources();
    expect(source).toContain('method: "GET"');
    // Shared helper is nodebbGet, not nodebbPost
    expect(source).toContain("nodebbGet");
    expect(source).not.toContain("nodebbPost");
  });

  it("search_ralphchives calls /api/search with category scoping", () => {
    const source = readAllSources();
    expect(source).toContain("/api/search");
    expect(source).toContain("categories[]");
  });

  it("get_topic calls /api/topic/:tid", () => {
    const source = readAllSources();
    expect(source).toContain("/api/topic/");
  });

  it("list_recent_topics calls /api/category/:cid", () => {
    const source = readAllSources();
    expect(source).toContain("/api/category/");
  });

  it("conditionally includes categoryId in schema when NODEBB_CATEGORY_ID is not set", () => {
    const source = readAllSources();
    expect(source).toContain("NODEBB_CATEGORY_ID");
    // search + list_recent_topics check NODEBB_CATEGORY_ID, get_topic does not (uses tid)
    const checks = (source.match(/NODEBB_CATEGORY_ID/g) ?? []).length;
    expect(checks).toBeGreaterThanOrEqual(4);
  });

  it("returns isError on failures", () => {
    const source = readAllSources();
    expect(source).toContain("isError: true");
  });

  it("search results include topic metadata", () => {
    const source = readAllSources();
    expect(source).toContain("topicId");
    expect(source).toContain("topicTitle");
    expect(source).toContain("matchCount");
  });

  it("truncates search snippets to 500 chars", () => {
    const source = readAllSources();
    expect(source).toContain("500");
    expect(source).toContain("...");
  });

  it("supports both stdio and HTTP transport", () => {
    const source = readAllSources();
    expect(source).toContain("StdioServerTransport");
    expect(source).toContain("StreamableHTTPServerTransport");
    expect(source).toContain("--transport");
    expect(source).toContain("--port");
  });

  it("creates stateless HTTP transport per request", () => {
    const source = readAllSources();
    expect(source).toContain("sessionIdGenerator: undefined");
  });

  it("includes /health endpoint", () => {
    const source = readAllSources();
    expect(source).toContain("/health");
  });
});
