import { describe, expect, it } from "vitest";
import { hostHooks, hostPermissionRules, HOST_READ_ONLY_COMMANDS } from "../../../src/cli/claude/claude-host-settings";
import { makeHostWorkspace } from "../../helpers/factories";

describe("hostHooks", () => {
  it("runs each hook script from the host's shared/hooks, keeping its arguments and the rest of the entry", () => {
    // Arrange
    const hooks = {
      PreToolUse: [
        {
          matcher: "*",
          hooks: [{ type: "command", command: "/workspace/.ralph/hooks/log-pre-tool.sh --cli claude", timeout: 5 }],
        },
      ],
      Stop: [{ hooks: [{ type: "command", command: "/workspace/.ralph/hooks/claude/result-gate.sh", timeout: 10 }] }],
    };

    // Act
    const rewritten = hostHooks(hooks, "/srv/ralph/shared/hooks");

    // Assert
    expect(rewritten).toEqual({
      PreToolUse: [
        {
          matcher: "*",
          hooks: [{ type: "command", command: "'/srv/ralph/shared/hooks/log-pre-tool.sh' --cli claude", timeout: 5 }],
        },
      ],
      Stop: [{ hooks: [{ type: "command", command: "'/srv/ralph/shared/hooks/claude/result-gate.sh'", timeout: 10 }] }],
    });
  });

  it("quotes a hooks directory with spaces and quotes as one shell word", () => {
    // Arrange
    const hooks = {
      SessionEnd: [{ hooks: [{ type: "command", command: "/workspace/.ralph/hooks/log-session-end.sh" }] }],
    };

    // Act
    const rewritten = hostHooks(hooks, "/home/o'neil/my repos/shared/hooks") as typeof hooks;

    // Assert
    expect(rewritten.SessionEnd[0].hooks[0].command).toBe(
      `'/home/o'\\''neil/my repos/shared/hooks/log-session-end.sh'`,
    );
  });

  it("rejects a command that does not run from the container's shared/hooks", () => {
    // Arrange
    const hooks = { Stop: [{ hooks: [{ type: "command", command: "/usr/local/bin/other-hook.sh" }] }] };

    // Act & Assert
    expect(() => hostHooks(hooks, "/srv/ralph/shared/hooks")).toThrow(
      'Claude Code hook command "/usr/local/bin/other-hook.sh" does not start with /workspace/.ralph/hooks/',
    );
  });
});

describe("hostPermissionRules", () => {
  const workspace = makeHostWorkspace({
    stageDir: "/out/hooks/run-analysis/improver",
    cwd: "/out/hooks/run-analysis/improver/work",
    artifactDir: "/out/hooks/run-analysis/artifacts",
    orchestratorDir: "/srv/ralph",
    additionalDirs: ["/out", "/srv/ralph/profiles", "/srv/ralph/shared"],
  });

  it("lets the stage read its working directory and every additional directory", () => {
    // Act
    const { allow } = hostPermissionRules(workspace, []);

    // Assert
    expect(allow.filter((rule) => rule.startsWith("Read("))).toEqual([
      "Read(//out/hooks/run-analysis/improver/work/**)",
      "Read(//out/**)",
      "Read(//srv/ralph/profiles/**)",
      "Read(//srv/ralph/shared/**)",
    ]);
  });

  it("lets the stage write only in its working and artifact directories, never in profiles/ or shared/", () => {
    // Act
    const { allow } = hostPermissionRules(workspace, []);

    // Assert
    expect(allow.filter((rule) => /^(Edit|Write)\(/.test(rule))).toEqual([
      "Edit(//out/hooks/run-analysis/improver/work/**)",
      "Edit(//out/hooks/run-analysis/artifacts/**)",
    ]);
  });

  it("allows only read-only Bash commands, without sed", () => {
    // Act
    const { allow } = hostPermissionRules(workspace, []);

    // Assert
    expect(allow.filter((rule) => rule.startsWith("Bash("))).toEqual(
      HOST_READ_ONLY_COMMANDS.map((command) => `Bash(${command} *)`),
    );
    expect(HOST_READ_ONLY_COMMANDS).not.toContain("sed");
  });

  it("allows skills, task tracking and spawning each of the stage's subagents", () => {
    // Act
    const { allow } = hostPermissionRules(workspace, ["run-analyzer", "agent-improver"]);

    // Assert
    expect(allow).toEqual(
      expect.arrayContaining([
        "Skill",
        "TaskCreate",
        "TaskGet",
        "TaskList",
        "TaskUpdate",
        "Agent(run-analyzer)",
        "Agent(agent-improver)",
      ]),
    );
  });

  it("denies reading the orchestrator's .env", () => {
    // Act
    const { deny } = hostPermissionRules(workspace, []);

    // Assert
    expect(deny).toEqual(["Read(//srv/ralph/.env)"]);
  });
});
