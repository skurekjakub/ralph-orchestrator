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

/** Claude Code event → fixture payload and the audit event its hook must write. */
const CLAUDE_EVENTS: Record<string, [fixture: string, auditEvent: string]> = {
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

/** Host script path and argv of a container hook command ("/workspace/.ralph/hooks/x.sh --cli claude"). */
function toHostCommand(command: string): { script: string; args: string[] } {
  expect(command.startsWith(CONTAINER_HOOKS_DIR)).toBe(true);
  const [script, ...args] = command.slice(CONTAINER_HOOKS_DIR.length).split(" ");
  return { script, args };
}

function commandsOf(event: string): ClaudeHookCommand[] {
  return claudeHooks[event].flatMap((group) => group.hooks);
}

describe("hook configurations", () => {
  describe("claude/hooks.json (managed-settings hooks fragment)", () => {
    let sandbox: HookSandbox;

    beforeEach(() => {
      sandbox = new HookSandbox();
    });

    afterEach(() => {
      sandbox.cleanup();
    });

    it("wires exactly the Claude Code events the audit trail and result gate need", () => {
      expect(Object.keys(claudeHooks).sort()).toEqual(Object.keys(CLAUDE_EVENTS).sort());
    });

    it("runs one command hook per event with a timeout", () => {
      for (const event of Object.keys(claudeHooks)) {
        const commands = commandsOf(event);
        expect(commands, event).toHaveLength(1);
        expect(commands[0].type, event).toBe("command");
        expect(commands[0].timeout, event).toBeGreaterThan(0);
      }
    });

    it("matches every tool in the tool events", () => {
      for (const event of ["PreToolUse", "PostToolUse", "PostToolUseFailure"]) {
        expect(claudeHooks[event].map((group) => group.matcher)).toEqual(["*"]);
      }
    });

    it("points every command at an executable script in shared/hooks", () => {
      for (const event of Object.keys(claudeHooks)) {
        const { script } = toHostCommand(commandsOf(event)[0].command);
        expect(() => accessSync(join(HOOKS_DIR, script), constants.X_OK), `${event}: ${script}`).not.toThrow();
      }
    });

    it.each(Object.entries(CLAUDE_EVENTS))(
      "%s runs a hook that writes a %s record from a Claude Code payload",
      async (event, [fixture, auditEvent]) => {
        const { script, args } = toHostCommand(commandsOf(event)[0].command);

        const run = await sandbox.runJson(script, args, claude[fixture], { RALPH_REQUIRE_RESULT_BLOCK: "1" });

        expect(run.exitCode).toBe(0);
        expect(run.stderr).toBe("");
        expect(sandbox.audit()).toEqual([expect.objectContaining({ event: auditEvent, cli: "claude" })]);
        expect(run.stdout).toEqual(event === "Stop" ? expect.stringContaining('"decision":"block"') : "");
      },
    );
  });

  describe("ralph-audit.json (Copilot CLI repository hooks)", () => {
    it("keeps the Copilot hook events and the no-flag commands Copilot runs today", () => {
      expect(copilotConfig.version).toBe(1);
      expect(
        Object.fromEntries(Object.entries(copilotConfig.hooks).map(([event, hooks]) => [event, hooks[0].bash])),
      ).toEqual({
        sessionStart: "/workspace/.ralph/hooks/log-session-start.sh",
        userPromptSubmitted: "/workspace/.ralph/hooks/log-prompt.sh",
        preToolUse: "/workspace/.ralph/hooks/log-pre-tool.sh",
        postToolUse: "/workspace/.ralph/hooks/log-post-tool.sh",
        errorOccurred: "/workspace/.ralph/hooks/log-error.sh",
        sessionEnd: "/workspace/.ralph/hooks/log-session-end.sh",
      });
    });

    it("points every command at an executable script in shared/hooks", () => {
      for (const hooks of Object.values(copilotConfig.hooks)) {
        const { script } = toHostCommand(hooks[0].bash);
        expect(() => accessSync(join(HOOKS_DIR, script), constants.X_OK), script).not.toThrow();
      }
    });
  });
});
