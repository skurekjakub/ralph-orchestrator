import { describe, expect, it } from "vitest";
import {
  ClaudePermissionMode,
  ClaudeSessionIds,
  ClaudeSettingSources,
  claudeSessionArgs,
  claudeSessionEnv,
  claudeSessionTools,
} from "../../../src/cli/claude/claude-session";
import { ReasoningEffort } from "../../../src/config/types";

describe("claudeSessionArgs", () => {
  const options = {
    agentName: "scientist",
    settingSources: ClaudeSettingSources.User,
    settingsPath: "/ws/claude-settings.json",
    permissionMode: ClaudePermissionMode.DontAsk,
    tools: ["Read", "Edit"],
    debugFile: "/ws/logs/claude.log",
  };

  it("runs a headless stream-json session with Ralph's settings, no MCP server and a capped tool list", () => {
    // Act
    const args = claudeSessionArgs(options, ["--session-id", "sid"]);

    // Assert
    expect(args).toEqual([
      "-p",
      "--output-format",
      "stream-json",
      "--verbose",
      "--agent",
      "scientist",
      "--setting-sources",
      "user",
      "--settings",
      "/ws/claude-settings.json",
      "--strict-mcp-config",
      "--permission-mode",
      "dontAsk",
      "--tools",
      "Read,Edit",
      "--session-id",
      "sid",
      "--debug-file",
      "/ws/logs/claude.log",
    ]);
  });

  it("adds the model, the effort, the MCP config and one --add-dir per directory when given", () => {
    // Act
    const args = claudeSessionArgs(
      {
        ...options,
        model: "opus",
        effort: ReasoningEffort.High,
        mcpConfigPath: "/workspace/.ralph/mcp-config.json",
        additionalDirs: ["/logs", "/repo/profiles"],
      },
      ["--resume", "sid"],
    ).join(" ");

    // Assert
    expect(args).toContain("--agent scientist --model opus --effort high --setting-sources user");
    expect(args).toContain("--mcp-config /workspace/.ralph/mcp-config.json --strict-mcp-config");
    expect(args).toContain("--tools Read,Edit --add-dir /logs --add-dir /repo/profiles --resume sid --debug-file");
  });
});

describe("claudeSessionTools", () => {
  it("adds the subagent tool only for a root that spawns subagents", () => {
    // Act & Assert
    expect(claudeSessionTools(["Read"], 2)).toEqual(["Read", "Agent"]);
    expect(claudeSessionTools(["Read"], 0)).toEqual(["Read"]);
  });
});

describe("claudeSessionEnv", () => {
  it("turns the result gate on or off and sets the spawn depth only for a root with subagents", () => {
    // Act & Assert
    expect(claudeSessionEnv(true, 3)).toEqual({
      RALPH_REQUIRE_RESULT_BLOCK: "1",
      CLAUDE_CODE_MAX_SUBAGENT_SPAWN_DEPTH: "3",
    });
    expect(claudeSessionEnv(false, 0)).toEqual({ RALPH_REQUIRE_RESULT_BLOCK: "0" });
  });
});

describe("ClaudeSessionIds", () => {
  it("resumes nothing before a session started", () => {
    // Act & Assert
    expect(new ClaudeSessionIds().resume()).toBeUndefined();
  });

  it("resumes the session the last start began, each start under a new id", () => {
    // Arrange
    const sessions = new ClaudeSessionIds();

    // Act
    const [, first] = sessions.start();
    const [, second] = sessions.start();

    // Assert
    expect(first).not.toBe(second);
    expect(sessions.resume()).toEqual(["--resume", second]);
  });
});
