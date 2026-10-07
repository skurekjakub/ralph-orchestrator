import { describe, it, expect } from "vitest";
import { join } from "node:path";
import { hostWorkspacePath, mountTargetDirs, workspaceMountTarget } from "../../src/container/workspace-paths";

describe("workspaceMountTarget", () => {
  it("makes a file path relative to /workspace", () => {
    // Act & Assert
    expect(workspaceMountTarget("/workspace/.github/hooks/ralph-audit.json", false)).toBe(
      ".github/hooks/ralph-audit.json",
    );
  });

  it("marks a directory with a trailing slash", () => {
    // Act & Assert
    expect(workspaceMountTarget("/workspace/.ralph/claude/agents", true)).toBe(".ralph/claude/agents/");
  });

  it.each(["/etc/ralph/claude-settings.json", "/workspace", "/workspace/../etc"])(
    "rejects %s, which is not inside /workspace",
    (path) => {
      // Act & Assert
      expect(() => workspaceMountTarget(path, false)).toThrow("is not inside /workspace");
    },
  );
});

describe("hostWorkspacePath", () => {
  it("maps a container path inside /workspace onto the task's workspace", () => {
    // Act & Assert
    expect(hostWorkspacePath("/ws/DF-1-1", "/workspace/.ralph/claude")).toBe(join("/ws/DF-1-1", ".ralph", "claude"));
  });

  it("keeps a name that only starts with two dots inside the workspace", () => {
    // Act & Assert
    expect(hostWorkspacePath("/ws/DF-1-1", "/workspace/..cache")).toBe(join("/ws/DF-1-1", "..cache"));
  });

  it("rejects a path outside /workspace", () => {
    // Act & Assert
    expect(() => hostWorkspacePath("/ws/DF-1-1", "/tmp/x")).toThrow("is not inside /workspace");
  });
});

describe("mountTargetDirs", () => {
  it("keeps a directory target and takes a file target's parent, as container paths", () => {
    // Act & Assert
    expect(mountTargetDirs([".github/agents/", ".github/hooks/ralph-audit.json"])).toEqual([
      "/workspace/.github/agents",
      "/workspace/.github/hooks",
    ]);
  });

  it("lists a directory several targets share once", () => {
    // Act & Assert
    expect(mountTargetDirs([".ralph/settings.json", ".ralph/mcp-config.json", ".ralph/"])).toEqual([
      "/workspace/.ralph",
    ]);
  });

  it("leaves out the workspace root a top-level file is mounted into", () => {
    // Act & Assert
    expect(mountTargetDirs(["settings.json"])).toEqual([]);
  });
});
