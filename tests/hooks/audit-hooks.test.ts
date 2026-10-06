import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { HookSandbox, loadPayloads, TOOL_OUTPUT_HEADER } from "./hook-harness.js";

const claude = loadPayloads("claude");
const copilot = loadPayloads("copilot");

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
      const runs = [
        await sandbox.runJson("log-session-start.sh", [], copilot.sessionStart),
        await sandbox.runJson("log-prompt.sh", [], copilot.userPromptSubmitted),
        await sandbox.runJson("log-pre-tool.sh", [], copilot.preToolUseBash),
        await sandbox.runJson("log-post-tool.sh", [], copilot.postToolUseBash),
        await sandbox.runJson("log-error.sh", [], copilot.errorOccurred),
        await sandbox.runJson("log-session-end.sh", [], copilot.sessionEnd),
      ];
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
      await sandbox.runJson("log-session-start.sh", [], copilot.sessionStart);
      await sandbox.runJson("log-prompt.sh", [], copilot.userPromptSubmitted);
      await sandbox.runJson("log-pre-tool.sh", [], copilot.preToolUseTask);
      await sandbox.runJson("log-post-tool.sh", [], copilot.postToolUseFailure);
      await sandbox.runJson("log-error.sh", [], copilot.errorOccurred);
      await sandbox.runJson("log-session-end.sh", [], copilot.sessionEnd);
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
      await sandbox.runJson("log-pre-tool.sh", [], copilot.preToolUseSkill);
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
    });

    it("writes the full tool output in the block format dashboard-local parses", async () => {
      const longText = `${"x".repeat(2500)}\nlast line`;
      await sandbox.runJson("log-post-tool.sh", [], {
        ...copilot.postToolUseBash,
        toolArgs: copilot.preToolUseTask.toolArgs,
        toolResult: { resultType: "success", textResultForLlm: longText },
      });
      const lines = sandbox.read("tool-output.log").split("\n");

      const utcClock = new Date(copilot.postToolUseBash.timestamp as number).toISOString().slice(11, 19);

      expect(lines[0]).toMatch(TOOL_OUTPUT_HEADER);
      expect(lines[0]).toBe(`── ${utcClock} bash (success) ──`);
      expect(lines.slice(1, 5).join("\n")).toBe(`args: ${copilot.preToolUseTask.toolArgs}`);
      expect(lines.slice(5).join("\n")).toBe(`${longText}\n\n`);
      expect((sandbox.audit()[0].resultText as string).endsWith("...[truncated]")).toBe(true);
    });

    it("logs failed tool calls to ralph.log", async () => {
      await sandbox.runJson("log-post-tool.sh", [], copilot.postToolUseFailure);

      expect(sandbox.read("ralph.log")).toBe(
        "[RALPH] TOOL FAILURE: task — Agent type 'leaf' not found. Available agents: helper\n",
      );
    });

    it("uses session 'unknown' when sessionStart never ran", async () => {
      await sandbox.runJson("log-pre-tool.sh", [], copilot.preToolUseBash);

      expect(sandbox.audit()[0].session).toBe("unknown");
    });
  });

  describe("Claude Code (--cli claude)", () => {
    it("records the session lifecycle with the CLI's own session id and no stdout", async () => {
      const runs = [
        await sandbox.runJson("log-session-start.sh", ["--cli", "claude"], claude.sessionStart),
        await sandbox.runJson("log-prompt.sh", ["--cli", "claude"], claude.userPromptSubmit),
        await sandbox.runJson("log-error.sh", ["--cli", "claude"], claude.stopFailure),
        await sandbox.runJson("log-session-end.sh", ["--cli", "claude"], claude.sessionEnd),
      ];

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
      const pre = { ...claude.postToolUseBash, hook_event_name: "PreToolUse" };
      delete (pre as Record<string, unknown>).tool_response;
      await sandbox.runJson("log-pre-tool.sh", ["--cli", "claude"], pre);
      await sandbox.runJson("log-post-tool.sh", ["--cli", "claude"], claude.postToolUseBash);
      const [preRecord, postRecord] = sandbox.audit();
      const output = sandbox.read("tool-output.log").split("\n");

      expect(preRecord.toolUseId).toBe("toolu_011Jt92sqkxnLQ29kBeyVTH8");
      expect(postRecord).toMatchObject({
        toolUseId: preRecord.toolUseId,
        resultText: "ralph-bash-ok",
        durationMs: 412,
      });
      expect(sandbox.preTool()).toHaveLength(1);
      expect(output[0]).toMatch(TOOL_OUTPUT_HEADER);
      expect(output[0]).toMatch(/ Bash \(success\) ──$/);
      expect(output[1]).toBe('args: {"command":"echo ralph-bash-ok","description":"Echo ralph-bash-ok"}');
      expect(sandbox.read("ralph.log")).toBe("");
    });

    it("records a PostToolUseFailure with --failure and logs it to ralph.log", async () => {
      const run = await sandbox.runJson(
        "log-post-tool.sh",
        ["--cli", "claude", "--failure"],
        claude.postToolUseFailure,
      );

      expect(run.exitCode).toBe(0);
      expect(sandbox.audit()[0]).toMatchObject({ event: "post_tool", resultType: "failure", agent: "helper" });
      expect(sandbox.read("tool-output.log").split("\n")[0]).toMatch(/ Agent \(failure\) ──$/);
      expect(sandbox.read("ralph.log")).toBe(
        "[RALPH] TOOL FAILURE: Agent — Agent type 'leaf' not found. Available agents: helper\n",
      );
    });

    it("records subagent spans and compactions", async () => {
      await sandbox.runJson("log-subagent.sh", ["--cli", "claude", "start"], claude.subagentStart);
      await sandbox.runJson("log-subagent.sh", ["--cli", "claude", "stop"], claude.subagentStop);
      await sandbox.runJson("log-compact.sh", ["--cli", "claude"], claude.preCompact);

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
      await sandbox.runJson("log-pre-tool.sh", ["--cli=claude"], claude.preToolUseSkill);

      expect(sandbox.audit()[0]).toMatchObject({ cli: "claude", skill: "ralph-echo" });
    });

    it("keeps complete lines when many hooks append at once", async () => {
      const bigCommand = "y".repeat(20_000);
      await Promise.all(
        Array.from({ length: 16 }, (_, index) =>
          sandbox.runJson("log-pre-tool.sh", ["--cli", "claude"], {
            ...claude.preToolUseSkill,
            tool_name: "Bash",
            tool_input: { command: bigCommand },
            tool_use_id: `toolu_${index}`,
          }),
        ),
      );

      const ids = sandbox.audit().map((record) => record.toolUseId);
      expect(ids.sort()).toEqual(Array.from({ length: 16 }, (_, index) => `toolu_${index}`).sort());
      expect(sandbox.preTool()).toHaveLength(16);
    });
  });

  describe("failure policy", () => {
    it.each([
      ["malformed JSON", '{"tool_name": "Bash", '],
      ["an empty payload", ""],
      ["a JSON array", "[1, 2]"],
    ])("exits 0 without stdout and records hook_error for %s", async (_label, input) => {
      const run = await sandbox.run("log-pre-tool.sh", ["--cli", "claude"], input);
      const records = sandbox.audit();

      expect(run.exitCode).toBe(0);
      expect(run.stdout).toBe("");
      expect(records).toHaveLength(1);
      expect(records[0]).toMatchObject({ event: "hook_error", hook: "pre_tool", cli: "claude", session: "unknown" });
      expect(sandbox.read("pre-tool.log")).toBe("");
      expect(sandbox.read("ralph.log")).toMatch(/^\[RALPH\] HOOK ERROR pre_tool \(claude\): /);
    });

    it("keeps the Copilot session on hook_error records", async () => {
      await sandbox.runJson("log-session-start.sh", [], copilot.sessionStart);
      await sandbox.run("log-post-tool.sh", [], "not json");

      const [start, failure] = sandbox.audit();
      expect(failure).toMatchObject({ event: "hook_error", hook: "post_tool", session: start.session });
    });

    it.each([
      ["an unsupported CLI", "log-pre-tool.sh", ["--cli", "gemini"], "unsupported --cli value 'gemini'"],
      ["a missing --cli value", "log-pre-tool.sh", ["--cli"], "--cli needs a value"],
      ["an unknown option", "log-prompt.sh", ["--cli", "claude", "--verbose"], "unknown option --verbose"],
      ["a stray argument", "log-post-tool.sh", ["--cli", "claude", "failure"], "unexpected argument failure"],
      ["--failure outside post-tool", "log-pre-tool.sh", ["--cli", "claude", "--failure"], "--failure only applies"],
      [
        "a subagent phase other than start/stop",
        "log-subagent.sh",
        ["--cli", "claude", "end"],
        "expected start or stop",
      ],
      ["a Claude-only event under the Copilot default", "log-compact.sh", [], "Copilot CLI emits no compact hook"],
    ])("reports %s as hook_error and exits 0", async (_label, script, args, message) => {
      const run = await sandbox.runJson(script, args, claude.preCompact);

      expect(run.exitCode).toBe(0);
      expect(run.stdout).toBe("");
      expect(run.stderr).toContain(message);
      expect(sandbox.audit()).toEqual([expect.objectContaining({ event: "hook_error" })]);
    });

    it("creates a missing log directory", async () => {
      const nested = join(sandbox.logDir, "deep", "logs");

      await sandbox.runJson("log-pre-tool.sh", ["--cli", "claude"], claude.preToolUseSkill, { RALPH_LOG_DIR: nested });

      expect(existsSync(join(nested, "audit.jsonl"))).toBe(true);
    });

    it("exits 0 and reports on stderr when the log directory cannot be created", async () => {
      const notADir = join(sandbox.logDir, "file");
      writeFileSync(notADir, "");

      const run = await sandbox.runJson("log-pre-tool.sh", ["--cli", "claude"], claude.preToolUseSkill, {
        RALPH_LOG_DIR: notADir,
      });

      expect(run.exitCode).toBe(0);
      expect(run.stdout).toBe("");
      expect(run.stderr).toContain("ralph hook pre_tool (claude)");
    });

    it("exits 0 when an existing log file cannot be appended to", async () => {
      mkdirSync(join(sandbox.logDir, "audit.jsonl"));

      const run = await sandbox.runJson("log-session-end.sh", ["--cli", "claude"], claude.sessionEnd);

      expect(run.exitCode).toBe(0);
      expect(run.stdout).toBe("");
      expect(run.stderr).toContain("ralph hook session_end (claude)");
    });
  });
});
