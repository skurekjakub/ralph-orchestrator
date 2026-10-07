import { describe, expect, it } from "vitest";
import { hostHooks, hostPermissionRules } from "../../../src/cli/claude/claude-host-settings";
import { createCliRuntimeRegistry } from "../../../src/cli/supported-runtimes";
import { ClaudeAuthMode, CliType, StageMode } from "../../../src/config/types";
import { StageWorkspaceResolver } from "../../../src/services/stage-workspace";
import { makeProfile, makeStage, makeTaskContext } from "../../helpers/factories";

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
      StopFailure: [{ hooks: [{ type: "command", command: "/workspace/.ralph/hooks/log-error.sh", timeout: 5 }] }],
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
      StopFailure: [{ hooks: [{ type: "command", command: "'/srv/ralph/shared/hooks/log-error.sh'", timeout: 5 }] }],
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
  const ctx = makeTaskContext({
    profile: makeProfile({ id: "docs" }),
    outputDir: "/out/DF-100-1",
    workspacePath: "/srv/ralph/cache/workspaces/DF-100-1",
  });
  const resolver = new StageWorkspaceResolver({
    cliRuntimes: createCliRuntimeRegistry(ClaudeAuthMode.OAuthToken),
    rootDir: "/srv/ralph",
  });
  const hookWorkspace = resolver.forHookStage(
    ctx,
    "run-analysis",
    makeStage({ role: "scientist", mode: StageMode.Local, cli: CliType.Claude }),
  );
  const variantStage = resolver.forStage(
    ctx,
    makeStage({ role: "reviewer", mode: StageMode.Local, cli: CliType.Claude }),
  );
  if (variantStage.mode !== StageMode.Local) throw new Error("a local stage resolves to a host workspace");
  const variantWorkspace = variantStage;

  it("lets a hook stage edit only its working directory and the hook's artifact directory", () => {
    // Act
    const { allow } = hostPermissionRules(hookWorkspace, []);

    // Assert
    expect(allow.filter((rule) => /^(Edit|Write)\(/.test(rule))).toEqual([
      "Edit(//out/DF-100-1/hooks/run-analysis/scientist/work/**)",
      "Edit(//out/DF-100-1/hooks/run-analysis/artifacts/**)",
    ]);
  });

  it("lets a variant's local stage edit only its working directory and the container stages' artifacts", () => {
    // Act
    const { allow } = hostPermissionRules(variantWorkspace, []);

    // Assert
    expect(allow.filter((rule) => /^(Edit|Write)\(/.test(rule))).toEqual([
      "Edit(//out/DF-100-1/stages/reviewer/work/**)",
      "Edit(//srv/ralph/cache/workspaces/DF-100-1/.ralph/tasks/DF-100/artifacts/**)",
    ]);
  });

  it.each([
    ["hook", hookWorkspace],
    ["variant", variantWorkspace],
  ])(
    "denies a %s stage the orchestrator's .env and every profile's .build/, where gateway.json lives",
    (_, workspace) => {
      // Act
      const { deny } = hostPermissionRules(workspace, []);

      // Assert
      expect(deny).toEqual(["Read(//srv/ralph/.env)", "Read(//srv/ralph/profiles/*/.build/**)"]);
    },
  );

  it("refuses reads outside the session's working directories instead of granting reads by rule", () => {
    // Act
    const permissions = hostPermissionRules(hookWorkspace, []);

    // Assert
    expect(permissions.blockReadsOutsideWorkingDirectories).toBe(true);
    expect(permissions.allow.filter((rule) => rule.startsWith("Read("))).toEqual([]);
  });

  it("allows with Bash only jq and date besides Claude Code's built-in read-only commands", () => {
    // Act
    const { allow } = hostPermissionRules(hookWorkspace, []);

    // Assert
    expect(allow.filter((rule) => rule.startsWith("Bash("))).toEqual(["Bash(jq *)", "Bash(date *)"]);
  });

  it("allows skills, task tracking and spawning each of the stage's subagents", () => {
    // Act
    const { allow } = hostPermissionRules(hookWorkspace, ["run-analyzer", "agent-improver"]);

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
});
