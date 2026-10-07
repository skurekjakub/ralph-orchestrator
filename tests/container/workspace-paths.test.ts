import { describe, it, expect } from "vitest";
import { join } from "node:path";
import { hostWorkspacePath, workspaceMountTarget } from "../../src/container/workspace-paths";

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

  it.each(["/etc/claude-code/managed-settings.json", "/workspace", "/workspace/../etc"])(
    "rejects %s, which is not inside /workspace",
    (path) => {
      // Act & Assert
      expect(() => workspaceMountTarget(path, false)).toThrow("is not inside /workspace");
    },
  );
});

describe("hostWorkspacePath", () => {
  it("maps a container path inside /workspace onto the target repo", () => {
    // Act & Assert
    expect(hostWorkspacePath("/repos/docs", "/workspace/.ralph/claude")).toBe(join("/repos/docs", ".ralph", "claude"));
  });

  it("keeps a name that only starts with two dots inside the repo", () => {
    // Act & Assert
    expect(hostWorkspacePath("/repos/docs", "/workspace/..cache")).toBe(join("/repos/docs", "..cache"));
  });

  it("rejects a path outside /workspace", () => {
    // Act & Assert
    expect(() => hostWorkspacePath("/repos/docs", "/tmp/x")).toThrow("is not inside /workspace");
  });
});
