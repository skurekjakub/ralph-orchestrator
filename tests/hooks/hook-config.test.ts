import { accessSync, constants, readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { CONTAINER_HOOKS_DIR, HOOKS_DIR, HookSandbox, loadPayloads } from "./hook-harness";

interface ClaudeHookCommand {
  readonly type: string;
  readonly command: string;
  readonly timeout: number;
}

type ClaudeHooks = Record<string, { readonly matcher?: string; readonly hooks: ClaudeHookCommand[] }[]>;

interface CopilotHookCommand {
  readonly type: string;
  readonly bash: string;
  readonly cwd: string;
  readonly timeoutSec: number;
}

const claudeHooks: ClaudeHooks = JSON.parse(readFileSync(join(HOOKS_DIR, "claude/hooks.json"), "utf8"));
const copilotConfig: { version: number; hooks: Record<string, CopilotHookCommand[]> } = JSON.parse(
  readFileSync(join(HOOKS_DIR, "ralph-audit.json"), "utf8"),
);
const claude = loadPayloads("claude");
const copilot = loadPayloads("copilot");

/** Claude Code hook event → fixture payload for it and the audit event its hook writes. */
const CLAUDE_FIXTURES: Record<string, [fixture: string, auditEvent: string]> = {
  SessionStart: ["sessionStart", "session_start"],
  UserPromptSubmit: ["userPromptSubmit", "prompt"],
  PreToolUse: ["preToolUseSkill", "pre_tool"],
  PostToolUse: ["postToolUseBash", "post_tool"],
  PostToolUseFailure: ["postToolUseFailure", "post_tool"],
  SubagentStart: ["subagentStart", "subagent_start"],
  SubagentStop: ["subagentStop", "subagent_stop"],
  PreCompact: ["preCompact", "compact"],
  Stop: ["stop", "result_gate_block"],
  StopFailure: ["stopFailure", "error"],
  SessionEnd: ["sessionEnd", "session_end"],
};

/** Copilot CLI hook event → fixture payload for it and the audit event its hook writes. */
const COPILOT_FIXTURES: Record<string, [fixture: string, auditEvent: string]> = {
  sessionStart: ["sessionStart", "session_start"],
  userPromptSubmitted: ["userPromptSubmitted", "prompt"],
  preToolUse: ["preToolUseBash", "pre_tool"],
  postToolUse: ["postToolUseBash", "post_tool"],
  errorOccurred: ["errorOccurred", "error"],
  sessionEnd: ["sessionEnd", "session_end"],
};

const claudeCommands = Object.entries(claudeHooks).flatMap(([event, groups]) =>
  groups.flatMap((group) => group.hooks.map((hook): [string, ClaudeHookCommand] => [event, hook])),
);
const copilotCommands = Object.entries(copilotConfig.hooks).flatMap(([event, hooks]) =>
  hooks.map((hook): [string, CopilotHookCommand] => [event, hook]),
);

/** Host script path and argv of a container hook command ("/workspace/.ralph/hooks/x.sh --cli claude"). */
function toHostCommand(command: string): { script: string; args: string[] } {
  if (!command.startsWith(CONTAINER_HOOKS_DIR)) {
    throw new Error(`${command} is not under ${CONTAINER_HOOKS_DIR}`);
  }
  const [script, ...args] = command.slice(CONTAINER_HOOKS_DIR.length).split(" ");
  return { script, args };
}

/**
 * The fixture payload and expected audit event for a configured hook event.
 * @throws Error when the suite has no fixture for an event the config wires.
 */
function fixtureFor(
  fixtures: Record<string, [fixture: string, auditEvent: string]>,
  event: string,
): [fixture: string, auditEvent: string] {
  const entry = fixtures[event];
  if (entry === undefined) {
    throw new Error(`no fixture payload for the configured ${event} hook`);
  }
  return entry;
}

function isExecutable(script: string): boolean {
  try {
    accessSync(join(HOOKS_DIR, script), constants.X_OK);
    return true;
  } catch {
    return false;
  }
}

describe("hook configurations", () => {
  let sandbox: HookSandbox;

  beforeEach(() => {
    sandbox = new HookSandbox();
  });

  afterEach(() => {
    sandbox.cleanup();
  });

  describe("claude/hooks.json (session settings hooks fragment)", () => {
    it.each(claudeCommands)("%s runs a command hook with a timeout", (_event, hook) => {
      // Act & Assert
      expect([hook.type, hook.timeout > 0]).toEqual(["command", true]);
    });

    it.each(claudeCommands)("%s points at an executable script in shared/hooks", (_event, hook) => {
      // Arrange
      const { script } = toHostCommand(hook.command);

      // Act & Assert
      expect(isExecutable(script), script).toBe(true);
    });

    it.each(claudeCommands)("%s writes its audit record from a Claude Code payload", async (event, hook) => {
      // Arrange
      const { script, args } = toHostCommand(hook.command);
      const [fixture, auditEvent] = fixtureFor(CLAUDE_FIXTURES, event);

      // Act
      const run = await sandbox.runJson(script, args, claude[fixture], { RALPH_REQUIRE_RESULT_BLOCK: "1" });

      // Assert
      expect([run.exitCode, run.stderr]).toEqual([0, ""]);
      expect(run.stdout).toEqual(event === "Stop" ? expect.stringContaining('"decision":"block"') : "");
      expect(sandbox.audit()).toEqual([expect.objectContaining({ event: auditEvent, cli: "claude" })]);
    });
  });

  describe("ralph-audit.json (Copilot CLI repository hooks)", () => {
    it.each(copilotCommands)("%s runs a command hook with a timeout", (_event, hook) => {
      // Act & Assert
      expect([hook.type, hook.timeoutSec > 0]).toEqual(["command", true]);
    });

    it.each(copilotCommands)("%s points at an executable script in shared/hooks", (_event, hook) => {
      // Arrange
      const { script } = toHostCommand(hook.bash);

      // Act & Assert
      expect(isExecutable(script), script).toBe(true);
    });

    it.each(copilotCommands)("%s writes its audit record from a Copilot payload", async (event, hook) => {
      // Arrange
      const { script, args } = toHostCommand(hook.bash);
      const [fixture, auditEvent] = fixtureFor(COPILOT_FIXTURES, event);

      // Act
      const run = await sandbox.runJson(script, args, copilot[fixture]);

      // Assert
      expect([run.exitCode, run.stdout, run.stderr]).toEqual([0, "", ""]);
      expect(sandbox.audit()).toEqual([expect.objectContaining({ event: auditEvent, cli: "copilot" })]);
    });
  });
});
