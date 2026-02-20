import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { writeFileSync, mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  loadMcpManifest,
  discoverMcpServers,
} from "../../src/container/setup/mcp-manifest.js";

function createTempDir(): string {
  const dir = join(tmpdir(), `ralph-manifest-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  mkdirSync(dir, { recursive: true });
  return dir;
}

function writeManifest(dir: string, name: string, manifest: Record<string, unknown>): void {
  const serverDir = join(dir, name);
  mkdirSync(serverDir, { recursive: true });
  writeFileSync(join(serverDir, "mcp-server.json"), JSON.stringify(manifest));
}

describe("MCP Manifest", () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = createTempDir();
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  describe("loadMcpManifest", () => {
    it("loads a valid manifest", () => {
      writeManifest(tempDir, "test-server", {
        name: "test-server",
        type: "npm",
        command: "npx",
        args: ["-y", "test-package"],
      });

      const manifest = loadMcpManifest(tempDir, "test-server");
      expect(manifest.name).toBe("test-server");
      expect(manifest.command).toBe("npx");
      expect(manifest.args).toEqual(["-y", "test-package"]);
    });

    it("throws for missing manifest", () => {
      expect(() => loadMcpManifest(tempDir, "nonexistent")).toThrow("MCP server manifest not found");
    });

    it("throws for manifest without name", () => {
      writeManifest(tempDir, "bad", { command: "node", args: [] });
      expect(() => loadMcpManifest(tempDir, "bad")).toThrow("name and command are required");
    });
  });

  describe("discoverMcpServers", () => {
    it("discovers servers with manifests", () => {
      writeManifest(tempDir, "server-a", { name: "a", command: "npx", args: [] });
      writeManifest(tempDir, "server-b", { name: "b", command: "node", args: [] });
      mkdirSync(join(tempDir, "no-manifest")); // no mcp-server.json

      const servers = discoverMcpServers(tempDir);
      expect(servers).toContain("server-a");
      expect(servers).toContain("server-b");
      expect(servers).not.toContain("no-manifest");
    });

    it("returns empty for nonexistent directory", () => {
      expect(discoverMcpServers("/nonexistent")).toEqual([]);
    });
  });
});
