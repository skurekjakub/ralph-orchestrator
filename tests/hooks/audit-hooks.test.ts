import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  parsePreToolLog,
  parseToolOutputLog,
} from "../../dashboard-local/src/components/log-browser/tool-log-timeline-parser";
import { HookSandbox, loadPayloads } from "./hook-harness";

const claude = loadPayloads("claude");
const copilot = loadPayloads("copilot");
const CLAUDE = ["--cli", "claude"];

describe("audit hook scripts", () => {
  let sandbox: HookSandbox;

  beforeEach(() => {
    sandbox = new HookSandbox();
  });

  afterEach(() => {
    sandbox.cleanup();
  });

  describe("Copilot CLI (ralph-audit.json, no --cli flag)", () => {
    it("records a whole session under the id minted at sessionStart", async () => {
      // Act
      const runs = [
        await sandbox.runJson("log-session-start.sh", [], copilot.sessionStart),
        await sandbox.runJson("log-prompt.sh", [], copilot.userPromptSubmitted),
        await sandbox.runJson("log-pre-tool.sh", [], copilot.preToolUseBash),
        await sandbox.runJson("log-post-tool.sh", [], copilot.postToolUseBash),
        await sandbox.runJson("log-error.sh", [], copilot.errorOccurred),
        await sandbox.runJson("log-session-end.sh", [], copilot.sessionEnd),
      ];

      // Assert
      const session = sandbox.read(".current-session-id").trim();
      const records = sandbox.audit();
      expect(runs.map((run) => [run.exitCode, run.stdout, run.stderr])).toEqual(runs.map(() => [0, "", ""]));
      expect(records.map((record) => record.event)).toEqual([
        "session_start",
        "prompt",
        "pre_tool",
        "post_tool",
        "error",
        "session_end",
      ]);
      expect(records.every((record) => record.session === session && record.cli === "copilot")).toBe(true);
      expect(sandbox.read("ralph.log")).toBe(
        `[RALPH] Session ${session} started (source=new)\n` +
          "[RALPH] ERROR [RateLimitError]: 429 Too Many Requests\n" +
          `[RALPH] Session ${session} ended (reason=complete)\n`,
      );
    });

    it("keeps every v1 key with its v1 type so existing readers keep working", async () => {
      // Act
      await sandbox.runJson("log-session-start.sh", [], copilot.sessionStart);
      await sandbox.runJson("log-prompt.sh", [], copilot.userPromptSubmitted);
      await sandbox.runJson("log-pre-tool.sh", [], copilot.preToolUseTask);
      await sandbox.runJson("log-post-tool.sh", [], copilot.postToolUseFailure);
      await sandbox.runJson("log-error.sh", [], copilot.errorOccurred);
      await sandbox.runJson("log-session-end.sh", [], copilot.sessionEnd);

      // Assert
      const [start, prompt, pre, post, error, end] = sandbox.audit();
      const string = expect.any(String);
      expect(start).toMatchObject({ timestamp: 1791321200000, session: string, source: string, initialPrompt: string });
      expect(start).toHaveProperty("cwd", "/workspace");
      expect(prompt).toMatchObject({ timestamp: 1791321200500, prompt: "Process DOC-3141" });
      expect(pre).toMatchObject({ timestamp: 1791321202000, tool: "task", args: copilot.preToolUseTask.toolArgs });
      expect(post).toMatchObject({ tool: "task", args: string, resultType: "failure", resultText: string });
      expect(error).toMatchObject({ errorName: "RateLimitError", errorMsg: string, errorStack: string });
      expect(end).toMatchObject({ reason: "complete", cwd: "/workspace" });
    });

    it("streams pre_tool records to pre-tool.log under the ts key", async () => {
      // Act
      await sandbox.runJson("log-pre-tool.sh", [], copilot.preToolUseSkill);

      // Assert
      const [line] = sandbox.preTool();
      const [record] = sandbox.audit();
      expect(line).not.toHaveProperty("timestamp");
      expect(line).toEqual(
        Object.fromEntries(Object.entries(record).map(([key, value]) => [key === "timestamp" ? "ts" : key, value])),
      );
      expect(line).toMatchObject({
        event: "pre_tool",
        ts: 1791321201000,
        tool: "skill",
        skill: "malph-vscode-workflow-setup",
      });
      expect(parsePreToolLog(sandbox.read("pre-tool.log"))).toEqual([
        expect.objectContaining({ ts: 1791321201000, tool: "skill", args: copilot.preToolUseSkill.toolArgs }),
      ]);
    });

    it("writes the full tool output in the block format dashboard-local parses", async () => {
      // Arrange
      const longText = `${"x".repeat(2500)}\nlast line`;
      const utcClock = new Date(copilot.postToolUseBash.timestamp as number).toISOString().slice(11, 19);

      // Act
      await sandbox.runJson("log-post-tool.sh", [], {
        ...copilot.postToolUseBash,
        toolArgs: copilot.preToolUseTask.toolArgs,
        toolResult: { resultType: "success", textResultForLlm: longText },
      });

      // Assert
      const lines = sandbox.read("tool-output.log").split("\n");
      expect(lines[0]).toBe(`── ${utcClock} bash (success) ──`);
      expect(parseToolOutputLog(sandbox.read("tool-output.log"))).toEqual([
        { tool: "bash", status: "success", args: copilot.preToolUseTask.toolArgs, returnValue: longText },
      ]);
      expect(lines.slice(1, 5).join("\n")).toBe(`args: ${copilot.preToolUseTask.toolArgs}`);
      expect(lines.slice(5).join("\n")).toBe(`${longText}\n\n`);
      expect((sandbox.audit()[0].resultText as string).endsWith("...[truncated]")).toBe(true);
    });

    it("logs failed tool calls to ralph.log", async () => {
      // Act
      await sandbox.runJson("log-post-tool.sh", [], copilot.postToolUseFailure);

      // Assert
      expect(sandbox.read("ralph.log")).toBe(
        "[RALPH] TOOL FAILURE: task — Agent type 'leaf' not found. Available agents: helper\n",
      );
    });

    it("uses session 'unknown' when sessionStart never ran", async () => {
      // Act
      await sandbox.runJson("log-pre-tool.sh", [], copilot.preToolUseBash);

      // Assert
      expect(sandbox.audit()[0].session).toBe("unknown");
    });
  });

  describe("Claude Code (--cli claude)", () => {
    it("records the session lifecycle with the CLI's own session id and no stdout", async () => {
      // Act
      const runs = [
        await sandbox.runJson("log-session-start.sh", CLAUDE, claude.sessionStart),
        await sandbox.runJson("log-prompt.sh", CLAUDE, claude.userPromptSubmit),
        await sandbox.runJson("log-error.sh", CLAUDE, claude.stopFailure),
        await sandbox.runJson("log-session-end.sh", CLAUDE, claude.sessionEnd),
      ];

      // Assert
      expect(runs.map((run) => [run.exitCode, run.stdout, run.stderr])).toEqual(runs.map(() => [0, "", ""]));
      expect(sandbox.audit().map((record) => [record.event, record.session])).toEqual([
        ["session_start", "1211139f-0de2-419c-964c-b5017fd1ccc2"],
        ["prompt", "1211139f-0de2-419c-964c-b5017fd1ccc2"],
        ["error", "1211139f-0de2-419c-964c-b5017fd1ccc2"],
        ["session_end", "1211139f-0de2-419c-964c-b5017fd1ccc2"],
      ]);
      expect(existsSync(join(sandbox.logDir, ".current-session-id"))).toBe(false);
    });

    it("pairs tool records by tool_use_id and fans out pre-tool.log and tool-output.log", async () => {
      // Arrange
      const pre: Record<string, unknown> = { ...claude.postToolUseBash, hook_event_name: "PreToolUse" };
      delete pre.tool_response;

      // Act
      await sandbox.runJson("log-pre-tool.sh", CLAUDE, pre);
      await sandbox.runJson("log-post-tool.sh", CLAUDE, claude.postToolUseBash);

      // Assert
      const [preRecord, postRecord] = sandbox.audit();
      expect(preRecord.toolUseId).toBe("toolu_011Jt92sqkxnLQ29kBeyVTH8");
      expect(postRecord).toMatchObject({
        toolUseId: preRecord.toolUseId,
        resultText: "ralph-bash-ok",
        durationMs: 412,
      });
      expect(sandbox.preTool()).toHaveLength(1);
      expect(parseToolOutputLog(sandbox.read("tool-output.log"))).toEqual([
        {
          tool: "Bash",
          status: "success",
          args: '{"command":"echo ralph-bash-ok","description":"Echo ralph-bash-ok"}',
          returnValue: "ralph-bash-ok",
        },
      ]);
      expect(sandbox.read("ralph.log")).toBe("");
    });

    it("records a PostToolUseFailure as a failure and logs it to ralph.log", async () => {
      // Act
      const run = await sandbox.runJson("log-post-tool.sh", CLAUDE, claude.postToolUseFailure);

      // Assert
      expect([run.exitCode, run.stderr]).toEqual([0, ""]);
      expect(sandbox.audit()[0]).toMatchObject({ event: "post_tool", resultType: "failure", agent: "helper" });
      expect(parseToolOutputLog(sandbox.read("tool-output.log"))).toEqual([
        expect.objectContaining({ tool: "Agent", status: "failure" }),
      ]);
      expect(sandbox.read("ralph.log")).toBe(
        "[RALPH] TOOL FAILURE: Agent — Agent type 'leaf' not found. Available agents: helper\n",
      );
    });

    it("records subagent spans and compactions", async () => {
      // Act
      await sandbox.runJson("log-subagent.sh", CLAUDE, claude.subagentStart);
      await sandbox.runJson("log-subagent.sh", CLAUDE, claude.subagentStop);
      await sandbox.runJson("log-compact.sh", CLAUDE, claude.preCompact);

      // Assert
      const [start, stop, compact] = sandbox.audit();
      expect(start).toMatchObject({ event: "subagent_start", subagent: "helper", agentId: "a2d45f3a31ba3dd20" });
      expect(stop).toMatchObject({ event: "subagent_stop", subagent: "helper", agentId: "a2d45f3a31ba3dd20" });
      expect(compact).toMatchObject({ event: "compact", trigger: "auto", agent: "orch", agentId: null });
      expect(sandbox.read("ralph.log")).toBe(
        "[RALPH] Subagent helper started (id=a2d45f3a31ba3dd20)\n" +
          "[RALPH] Subagent helper stopped (id=a2d45f3a31ba3dd20)\n" +
          "[RALPH] Context compaction (trigger=auto, agent=orch)\n",
      );
    });

    it("accepts --cli=claude", async () => {
      // Act
      await sandbox.runJson("log-pre-tool.sh", ["--cli=claude"], claude.preToolUseSkill);

      // Assert
      expect(sandbox.audit()[0]).toMatchObject({ cli: "claude", skill: "ralph-echo" });
    });

    it("keeps complete lines when many hooks append at once", async () => {
      // Arrange
      const bigCommand = "y".repeat(20_000);
      const payloads = Array.from({ length: 16 }, (_, index) => ({
        ...claude.preToolUseSkill,
        tool_name: "Bash",
        tool_input: { command: bigCommand },
        tool_use_id: `toolu_${index}`,
      }));

      // Act
      await Promise.all(payloads.map((payload) => sandbox.runJson("log-pre-tool.sh", CLAUDE, payload)));

      // Assert
      const ids = sandbox.audit().map((record) => record.toolUseId);
      expect(ids.sort()).toEqual(payloads.map((payload) => payload.tool_use_id).sort());
      expect(sandbox.preTool()).toHaveLength(16);
    });
  });

  describe("failure policy", () => {
    it.each([
      ["malformed JSON", '{"tool_name": "Bash", '],
      ["an empty payload", ""],
      ["a JSON array", "[1, 2]"],
    ])("exits 0 without stdout and records hook_error for %s", async (_label, input) => {
      // Act
      const run = await sandbox.run("log-pre-tool.sh", CLAUDE, input);

      // Assert
      expect(run.exitCode).toBe(0);
      expect(run.stdout).toBe("");
      expect(sandbox.audit()).toEqual([
        expect.objectContaining({ event: "hook_error", hook: "pre_tool", cli: "claude", session: "unknown" }),
      ]);
      expect(sandbox.read("pre-tool.log")).toBe("");
      expect(sandbox.read("ralph.log")).toMatch(/^\[RALPH\] HOOK ERROR pre_tool \(claude\): /);
    });

    it("keeps the Copilot session on hook_error records", async () => {
      // Arrange
      await sandbox.runJson("log-session-start.sh", [], copilot.sessionStart);

      // Act
      await sandbox.run("log-post-tool.sh", [], "not json");

      // Assert
      const [start, failure] = sandbox.audit();
      expect(failure).toMatchObject({ event: "hook_error", hook: "post_tool", session: start.session });
    });

    it.each([
      [
        "an unsupported CLI",
        "log-pre-tool.sh",
        ["--cli", "gemini"],
        "preToolUseSkill",
        "unsupported --cli value 'gemini'",
      ],
      ["a missing --cli value", "log-pre-tool.sh", ["--cli"], "preToolUseSkill", "--cli needs a value"],
      ["an unknown option", "log-prompt.sh", [...CLAUDE, "--verbose"], "userPromptSubmit", "unknown option --verbose"],
      ["a stray argument", "log-subagent.sh", [...CLAUDE, "stop"], "subagentStop", "unexpected argument stop"],
      ["a payload that is not a JSON object", "log-pre-tool.sh", CLAUDE, "notAnObject", "payload is not a JSON object"],
      [
        "a payload for another hook",
        "log-pre-tool.sh",
        CLAUDE,
        "postToolUseBash",
        "PostToolUse payload sent to the pre_tool hook",
      ],
      [
        "a payload without hook_event_name",
        "log-compact.sh",
        CLAUDE,
        "noHookEventName",
        "payload has no hook_event_name",
      ],
      [
        "an unknown hook_event_name",
        "log-compact.sh",
        CLAUDE,
        "unknownHookEventName",
        "unknown hook_event_name Teleport",
      ],
      [
        "a Claude-only event under the Copilot default",
        "log-compact.sh",
        [],
        "preCompact",
        "Copilot CLI emits no compact hook",
      ],
    ])("reports %s as hook_error and exits 0", async (_label, script, args, fixture, message) => {
      // Arrange
      const payloads: Record<string, unknown> = {
        ...claude,
        notAnObject: [1, 2],
        noHookEventName: { session_id: "s1", trigger: "auto" },
        unknownHookEventName: { ...claude.preCompact, hook_event_name: "Teleport" },
      };

      // Act
      const run = await sandbox.runJson(script, args, payloads[fixture]);

      // Assert
      expect(run.exitCode).toBe(0);
      expect(run.stdout).toBe("");
      expect(run.stderr).toContain(message);
      expect(sandbox.audit()).toEqual([expect.objectContaining({ event: "hook_error" })]);
    });

    it("creates a missing log directory", async () => {
      // Arrange
      const nested = join(sandbox.logDir, "deep", "logs");

      // Act
      await sandbox.runJson("log-pre-tool.sh", CLAUDE, claude.preToolUseSkill, { RALPH_LOG_DIR: nested });

      // Assert
      expect(existsSync(join(nested, "audit.jsonl"))).toBe(true);
    });

    it("exits 0 and reports on stderr when the log directory cannot be created", async () => {
      // Arrange
      const notADir = join(sandbox.logDir, "file");
      writeFileSync(notADir, "");

      // Act
      const run = await sandbox.runJson("log-pre-tool.sh", CLAUDE, claude.preToolUseSkill, { RALPH_LOG_DIR: notADir });

      // Assert
      expect(run.exitCode).toBe(0);
      expect(run.stdout).toBe("");
      expect(run.stderr).toContain("ralph hook pre_tool (claude)");
    });

    it("exits 0 when an existing log file cannot be appended to", async () => {
      // Arrange
      mkdirSync(join(sandbox.logDir, "audit.jsonl"));

      // Act
      const run = await sandbox.runJson("log-session-end.sh", CLAUDE, claude.sessionEnd);

      // Assert
      expect(run.exitCode).toBe(0);
      expect(run.stdout).toBe("");
      expect(run.stderr).toContain("ralph hook session_end (claude)");
    });
  });
});
