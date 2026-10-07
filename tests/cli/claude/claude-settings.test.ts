import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { buildSessionSettings, readClaudeHooks, writeClaudeSettings } from "../../../src/cli/claude/claude-settings";
import { profileBuildPaths } from "../../../src/container/setup/build-paths";
import { createTempDir } from "../../helpers/mcp-fs";
import { createMockLogger } from "../../helpers/mocks";

const HOOKS = {
  Stop: [{ hooks: [{ type: "command", command: "/workspace/.ralph/hooks/claude/result-gate.sh", timeout: 10 }] }],
};

describe("buildSessionSettings", () => {
  it("hides attribution, keeps every hook on and embeds the hooks unchanged", () => {
    // Act
    const settings = buildSessionSettings(HOOKS);

    // Assert
    expect(settings).toEqual({
      attribution: { commit: "", pr: "" },
      disableAllHooks: false,
      hooks: HOOKS,
    });
    expect(settings.hooks).toBe(HOOKS);
  });
});

describe("readClaudeHooks", () => {
  let hooksDir: string;

  beforeEach(() => {
    hooksDir = createTempDir();
    mkdirSync(join(hooksDir, "claude"));
  });

  afterEach(() => {
    rmSync(hooksDir, { recursive: true, force: true });
  });

  it("reads the hooks object from claude/hooks.json", () => {
    // Arrange
    writeFileSync(join(hooksDir, "claude", "hooks.json"), JSON.stringify(HOOKS));

    // Act & Assert
    expect(readClaudeHooks(hooksDir)).toEqual(HOOKS);
  });

  it("throws when the file is missing", () => {
    // Act & Assert
    expect(() => readClaudeHooks(hooksDir)).toThrow(/Failed to read Claude Code hooks from .*hooks\.json: ENOENT/);
  });

  it("throws when the file is not JSON", () => {
    // Arrange
    writeFileSync(join(hooksDir, "claude", "hooks.json"), "{ not json");

    // Act & Assert
    expect(() => readClaudeHooks(hooksDir)).toThrow(/Failed to read Claude Code hooks/);
  });

  it.each(["[]", "null", '"Stop"'])("throws when the file holds %s instead of an object", (content) => {
    // Arrange
    writeFileSync(join(hooksDir, "claude", "hooks.json"), content);

    // Act & Assert
    expect(() => readClaudeHooks(hooksDir)).toThrow(/must be a JSON object keyed by hook event/);
  });
});

describe("writeClaudeSettings", () => {
  let root: string;

  beforeEach(() => {
    root = createTempDir();
    mkdirSync(join(root, "shared", "hooks", "claude"), { recursive: true });
    writeFileSync(join(root, "shared", "hooks", "claude", "hooks.json"), JSON.stringify(HOOKS));
  });

  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
  });

  it("writes the session settings and an empty user settings file into .build/claude", () => {
    // Arrange
    const paths = profileBuildPaths(root, "docs");
    const logger = createMockLogger();

    // Act
    writeClaudeSettings(paths, logger);

    // Assert
    const session = JSON.parse(readFileSync(join(paths.buildDir, "claude", "session-settings.json"), "utf-8"));
    expect(session).toEqual({ attribution: { commit: "", pr: "" }, disableAllHooks: false, hooks: HOOKS });
    expect(readFileSync(join(paths.buildDir, "claude", "user-settings.json"), "utf-8")).toBe("{}\n");
    expect(logger.info).toHaveBeenCalledWith(expect.stringContaining("1 hook events"));
  });
});
