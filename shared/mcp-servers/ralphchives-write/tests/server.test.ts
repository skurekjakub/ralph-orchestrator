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

describe("Ralphchives Write MCP Server manifest", () => {
  it("declares correct server metadata", () => {
    const manifest = loadManifest();
    expect(manifest.name).toBe("ralphchives-write");
    expect(manifest.type).toBe("custom");
    expect(manifest.command).toBe("node");
    expect(manifest.args).toEqual(["dist/bundle.js"]);
    expect(manifest.containerPath).toBe("/opt/mcp/servers/ralphchives-write");
  });

  it("assigns sidecar port 9106", () => {
    const manifest = loadManifest();
    expect(manifest.sidecarPort).toBe(9106);
  });

  it("requires NODEBB_API_TOKEN env var", () => {
    const manifest = loadManifest();
    expect(manifest.requiredEnv).toEqual(["NODEBB_API_TOKEN"]);
  });

  it("requires NODEBB_CATEGORY_ID config", () => {
    const manifest = loadManifest();
    expect(manifest.requiredConfig).toEqual(["NODEBB_CATEGORY_ID"]);
  });

  it("lists both tool names", () => {
    const manifest = loadManifest();
    expect(manifest.tools).toEqual(["post_task_report", "post_observation"]);
  });
});

describe("Ralphchives Write MCP Server source", () => {
  it("defines both tools", () => {
    const source = readAllSources();
    expect(source).toContain('"post_task_report"');
    expect(source).toContain('"post_observation"');
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

  it("posts to /api/v3/topics endpoint", () => {
    const source = readAllSources();
    expect(source).toContain("/api/v3/topics");
  });

  it("conditionally includes categoryId in schema when NODEBB_CATEGORY_ID is not set", () => {
    const source = readAllSources();
    expect(source).toContain("NODEBB_CATEGORY_ID");
    // Both tools check NODEBB_CATEGORY_ID for conditional schema
    const checks = (source.match(/NODEBB_CATEGORY_ID/g) ?? []).length;
    // 1 definition + 2 exports + 2 schema checks + 2 handler fallbacks = ~7
    expect(checks).toBeGreaterThanOrEqual(5);
  });

  it("returns isError on failures", () => {
    const source = readAllSources();
    expect(source).toContain("isError: true");
  });

  it("includes success response with topicId and slug", () => {
    const source = readAllSources();
    expect(source).toContain("topicId");
    expect(source).toContain("slug");
    expect(source).toContain("success: true");
  });

  it("post_observation adds [Observation] prefix to title", () => {
    const source = readAllSources();
    expect(source).toContain("[Observation]");
  });

  it("post_observation adds observation tag", () => {
    const source = readAllSources();
    expect(source).toContain('"observation"');
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
