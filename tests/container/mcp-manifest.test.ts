import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import {
  loadMcpManifest,
  discoverMcpServers,
} from "../../src/container/setup/mcp-manifest.js";
import { createTempDir, writeManifest } from "../helpers/mcp-fs.js";

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
        sidecarPort: 9100,
      });

      const manifest = loadMcpManifest(tempDir, "test-server");
      expect(manifest.name).toBe("test-server");
      expect(manifest.command).toBe("npx");
      expect(manifest.args).toEqual(["-y", "test-package"]);
      expect(manifest.sidecarPort).toBe(9100);
    });

    it("throws for missing manifest", () => {
      expect(() => loadMcpManifest(tempDir, "nonexistent")).toThrow("MCP server manifest not found");
    });

    it("throws for manifest without name", () => {
      writeManifest(tempDir, "bad", { command: "node", args: [], sidecarPort: 9100 });
      expect(() => loadMcpManifest(tempDir, "bad")).toThrow("name and command are required");
    });

    it("throws for manifest without valid sidecarPort", () => {
      writeManifest(tempDir, "no-port", { name: "no-port", command: "node", args: [] });
      expect(() => loadMcpManifest(tempDir, "no-port")).toThrow("sidecarPort must be an integer between 1 and 65535");
    });

    it("throws for out-of-range sidecarPort", () => {
      writeManifest(tempDir, "bad-port", { name: "bad-port", command: "node", args: [], sidecarPort: 70000 });
      expect(() => loadMcpManifest(tempDir, "bad-port")).toThrow("sidecarPort must be an integer between 1 and 65535");
    });

    it("accepts valid requiredConfig", () => {
      writeManifest(tempDir, "with-config", {
        name: "with-config", command: "node", args: [], sidecarPort: 9100,
        requiredConfig: ["ADO_PROJECT", "ADO_REPO"],
      });
      const manifest = loadMcpManifest(tempDir, "with-config");
      expect(manifest.requiredConfig).toEqual(["ADO_PROJECT", "ADO_REPO"]);
    });

    it("accepts manifest without requiredConfig", () => {
      writeManifest(tempDir, "no-config", {
        name: "no-config", command: "node", args: [], sidecarPort: 9100,
      });
      const manifest = loadMcpManifest(tempDir, "no-config");
      expect(manifest.requiredConfig).toBeUndefined();
    });

    it("throws for empty requiredConfig array", () => {
      writeManifest(tempDir, "empty-config", {
        name: "empty-config", command: "node", args: [], sidecarPort: 9100,
        requiredConfig: [],
      });
      expect(() => loadMcpManifest(tempDir, "empty-config")).toThrow("requiredConfig must be a non-empty array");
    });
  });

  describe("discoverMcpServers", () => {
    it("discovers servers with manifests", () => {
      writeManifest(tempDir, "server-a", { name: "a", command: "npx", args: [], sidecarPort: 9100 });
      writeManifest(tempDir, "server-b", { name: "b", command: "node", args: [], sidecarPort: 9101 });
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
