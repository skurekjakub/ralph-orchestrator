import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import {
  loadMcpManifest,
  discoverMcpServers,
  McpServerType,
  resolveToolAllowlist,
} from "../../src/container/setup/mcp-manifest";
import { createTempDir, writeManifest } from "../helpers/mcp-fs";

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
        name: "with-config",
        command: "node",
        args: [],
        sidecarPort: 9100,
        requiredConfig: ["ADO_PROJECT", "ADO_REPO"],
      });
      const manifest = loadMcpManifest(tempDir, "with-config");
      expect(manifest.requiredConfig).toEqual(["ADO_PROJECT", "ADO_REPO"]);
    });

    it("accepts manifest without requiredConfig", () => {
      writeManifest(tempDir, "no-config", {
        name: "no-config",
        command: "node",
        args: [],
        sidecarPort: 9100,
      });
      const manifest = loadMcpManifest(tempDir, "no-config");
      expect(manifest.requiredConfig).toBeUndefined();
    });

    it("throws for empty requiredConfig array", () => {
      writeManifest(tempDir, "empty-config", {
        name: "empty-config",
        command: "node",
        args: [],
        sidecarPort: 9100,
        requiredConfig: [],
      });
      expect(() => loadMcpManifest(tempDir, "empty-config")).toThrow("requiredConfig must be a non-empty array");
    });

    it("accepts a tools allowlist", () => {
      writeManifest(tempDir, "with-tools", {
        name: "with-tools",
        command: "node",
        args: [],
        sidecarPort: 9100,
        tools: ["a_tool", "b_tool"],
      });

      expect(loadMcpManifest(tempDir, "with-tools").tools).toEqual(["a_tool", "b_tool"]);
    });

    it.each([
      ["is not an array", "a_tool", "tools must be an array of non-empty strings"],
      ["names a non-string tool", ["a_tool", 7], "tools must be an array of non-empty strings"],
      ["names an empty tool", ["a_tool", ""], "tools must be an array of non-empty strings"],
      ["repeats a tool", ["a_tool", "a_tool"], "tools must not contain duplicates"],
    ])("throws when tools %s", (_label, tools, message) => {
      writeManifest(tempDir, "bad-tools", { name: "bad-tools", command: "node", args: [], sidecarPort: 9100, tools });

      expect(() => loadMcpManifest(tempDir, "bad-tools")).toThrow(message);
    });

    it("accepts valid initScript when file exists", () => {
      writeManifest(tempDir, "with-init", {
        name: "with-init",
        command: "node",
        args: [],
        sidecarPort: 9100,
        initScript: "init.sh",
      });
      writeFileSync(join(tempDir, "with-init", "init.sh"), "#!/bin/bash\necho init");

      const manifest = loadMcpManifest(tempDir, "with-init");
      expect(manifest.initScript).toBe("init.sh");
    });

    it("throws for initScript when file does not exist", () => {
      writeManifest(tempDir, "missing-init", {
        name: "missing-init",
        command: "node",
        args: [],
        sidecarPort: 9100,
        initScript: "init.sh",
      });
      expect(() => loadMcpManifest(tempDir, "missing-init")).toThrow("init script not found");
    });

    it("throws for empty initScript string", () => {
      writeManifest(tempDir, "empty-init", {
        name: "empty-init",
        command: "node",
        args: [],
        sidecarPort: 9100,
        initScript: "",
      });
      expect(() => loadMcpManifest(tempDir, "empty-init")).toThrow("initScript must be a non-empty string");
    });

    it("throws for initScript with path traversal", () => {
      writeManifest(tempDir, "traversal", {
        name: "traversal",
        command: "node",
        args: [],
        sidecarPort: 9100,
        initScript: "../../etc/passwd",
      });
      expect(() => loadMcpManifest(tempDir, "traversal")).toThrow("relative path within the server directory");
    });

    it("throws for absolute initScript path", () => {
      writeManifest(tempDir, "abs-init", {
        name: "abs-init",
        command: "node",
        args: [],
        sidecarPort: 9100,
        initScript: "/etc/passwd",
      });
      expect(() => loadMcpManifest(tempDir, "abs-init")).toThrow("relative path within the server directory");
    });
  });

  describe("resolveToolAllowlist", () => {
    const base = { name: "s", description: "", type: McpServerType.Npm, command: "x", args: [], sidecarPort: 9100 };

    it("returns the declared tools", () => {
      expect(resolveToolAllowlist({ ...base, tools: ["a_tool"] })).toEqual(["a_tool"]);
    });

    it("returns undefined, allowing every tool, when tools is absent or empty", () => {
      expect(resolveToolAllowlist(base)).toBeUndefined();
      expect(resolveToolAllowlist({ ...base, tools: [] })).toBeUndefined();
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
