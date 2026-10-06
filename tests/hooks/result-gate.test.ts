import { randomUUID } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { HookSandbox, loadPayloads, type HookRun } from "./hook-harness";

const GATE = "claude/result-gate.sh";
const SESSION = "92997de5-bf09-4b78-993c-bc33d66e925e";
const RESULT_BLOCK = "===RALPH_RESULT_START===\nSTATUS: completed\nPR_URL: none\n===RALPH_RESULT_END===";
const PROMPT =
  "Process DOC-3141. When you finish, print:\n===RALPH_RESULT_START===\nSTATUS: <status>\n===RALPH_RESULT_END===";
const GATE_ON = { RALPH_REQUIRE_RESULT_BLOCK: "1" };

const stop = loadPayloads("claude").stop;

/** One line of a Claude Code session transcript, shaped like CC 2.1.292 writes them. */
function transcriptMessage(type: "user" | "assistant", content: unknown, isSidechain = false): string {
  return JSON.stringify({
    parentUuid: null,
    isSidechain,
    userType: "external",
    cwd: "/workspace",
    sessionId: SESSION,
    version: "2.1.292",
    type,
    message: { role: type, content },
    uuid: randomUUID(),
    timestamp: "2026-10-06T21:10:00.047Z",
  });
}

function assistantText(text: string, isSidechain = false): string {
  return transcriptMessage("assistant", [{ type: "text", text }], isSidechain);
}

describe("claude/result-gate.sh", () => {
  let sandbox: HookSandbox;

  beforeEach(() => {
    sandbox = new HookSandbox();
  });

  afterEach(() => {
    sandbox.cleanup();
  });

  function writeTranscript(lines: readonly string[]): string {
    const path = join(sandbox.logDir, `${SESSION}.jsonl`);
    writeFileSync(path, `${lines.join("\n")}\n`);
    return path;
  }

  function runGate(overrides: Record<string, unknown> = {}, env: Record<string, string> = GATE_ON): Promise<HookRun> {
    return sandbox.runJson(GATE, [], { ...stop, ...overrides }, env);
  }

  function expectBlocked(run: HookRun): void {
    expect(run.exitCode).toBe(0);
    expect(run.stderr).toBe("");
    const decision = JSON.parse(run.stdout);
    expect(decision.decision).toBe("block");
    expect(decision.reason).toContain("===RALPH_RESULT_START===");
    expect(decision.reason).toContain("===RALPH_RESULT_END===");
  }

  function expectAllowed(run: HookRun): void {
    expect(run.exitCode).toBe(0);
    expect(run.stdout).toBe("");
  }

  describe("when the stage does not require a result block", () => {
    it.each([[{}], [{ RALPH_REQUIRE_RESULT_BLOCK: "0" }]])("allows every stop (env %j)", async (env) => {
      const run = await runGate({}, env);

      expectAllowed(run);
      expect(sandbox.read("audit.jsonl")).toBe("");
    });
  });

  describe("when the result block is missing", () => {
    it("blocks the stop and records why", async () => {
      const run = await runGate();

      expectBlocked(run);
      expect(sandbox.audit()).toEqual([
        expect.objectContaining({
          schemaVersion: 2,
          event: "result_gate_block",
          session: SESSION,
          cli: "claude",
          agent: "orch",
          blocks: 1,
          max: 2,
        }),
      ]);
      expect(sandbox.read("ralph.log")).toBe(
        "[RALPH] Result gate blocked stop 1/2: no ===RALPH_RESULT_END=== block yet\n",
      );
      expect(sandbox.read(`.result-gate-${SESSION}`)).toBe("1\n");
    });

    it("blocks at most RALPH_RESULT_GATE_MAX times per session, then allows the stop", async () => {
      const first = await runGate();
      const second = await runGate({ stop_hook_active: true });
      const third = await runGate({ stop_hook_active: true });
      const later = await runGate({ stop_hook_active: false });

      expectBlocked(first);
      expectBlocked(second);
      expectAllowed(third);
      expectAllowed(later);
      expect(sandbox.audit().map((record) => [record.event, record.blocks])).toEqual([
        ["result_gate_block", 1],
        ["result_gate_block", 2],
        ["result_gate_exhausted", 2],
        ["result_gate_exhausted", 2],
      ]);
    });

    it("blocks once, then allows, with RALPH_RESULT_GATE_MAX=1", async () => {
      const env = { ...GATE_ON, RALPH_RESULT_GATE_MAX: "1" };

      expectBlocked(await runGate({}, env));
      expectAllowed(await runGate({ stop_hook_active: true }, env));
    });

    it("never blocks with RALPH_RESULT_GATE_MAX=0", async () => {
      const run = await runGate({}, { ...GATE_ON, RALPH_RESULT_GATE_MAX: "0" });

      expectAllowed(run);
      expect(sandbox.audit()).toEqual([expect.objectContaining({ event: "result_gate_exhausted", blocks: 0, max: 0 })]);
    });

    it("falls back to two blocks for an invalid RALPH_RESULT_GATE_MAX", async () => {
      const env = { ...GATE_ON, RALPH_RESULT_GATE_MAX: "lots" };

      expectBlocked(await runGate({}, env));
      expectBlocked(await runGate({ stop_hook_active: true }, env));
      expectAllowed(await runGate({ stop_hook_active: true }, env));
    });

    it("counts blocks per session", async () => {
      await runGate();
      await runGate({ stop_hook_active: true });

      expectBlocked(await runGate({ session_id: "11111111-2222-3333-4444-555555555555" }));
    });

    it.each([
      ["only the start marker", "===RALPH_RESULT_START===\nSTATUS: completed"],
      ["only the end marker", "STATUS: completed\n===RALPH_RESULT_END==="],
      ["the markers in the wrong order", "===RALPH_RESULT_END===\n===RALPH_RESULT_START==="],
    ])("blocks a last message with %s", async (_label, text) => {
      expectBlocked(await runGate({ last_assistant_message: text }));
    });

    it("decides on the last message alone when the transcript is missing", async () => {
      expectBlocked(await runGate({ transcript_path: join(sandbox.logDir, "missing.jsonl") }));
    });
  });

  describe("when the result block exists", () => {
    it("allows a last message that holds the block", async () => {
      const run = await runGate({ last_assistant_message: `Done. ✓ Résumé below.\n${RESULT_BLOCK}` });

      expectAllowed(run);
      expect(sandbox.read("audit.jsonl")).toBe("");
    });

    it("allows when an earlier main-thread turn printed the block", async () => {
      const transcript = writeTranscript([
        transcriptMessage("user", PROMPT),
        assistantText(`All done.\n${RESULT_BLOCK}`),
        assistantText("Anything else? 🚀"),
      ]);

      expectAllowed(await runGate({ transcript_path: transcript, last_assistant_message: "Anything else? 🚀" }));
    });

    it("reads past malformed transcript lines", async () => {
      const transcript = writeTranscript([
        "{not json",
        transcriptMessage("user", PROMPT),
        assistantText(RESULT_BLOCK),
        '{"type":"assistant","isSidechain":false,"message":{"content":[{"type":"te',
      ]);

      expectAllowed(await runGate({ transcript_path: transcript }));
    });
  });

  describe("text that does not count as the block", () => {
    it("ignores the markers quoted in the user prompt and queue entries", async () => {
      const transcript = writeTranscript([
        JSON.stringify({ type: "queue-operation", operation: "enqueue", content: RESULT_BLOCK, sessionId: SESSION }),
        transcriptMessage("user", RESULT_BLOCK),
        JSON.stringify({ type: "last-prompt", lastPrompt: RESULT_BLOCK, sessionId: SESSION }),
        assistantText("Working on it."),
      ]);

      expectBlocked(await runGate({ transcript_path: transcript }));
    });

    it("ignores a block printed by a subagent", async () => {
      const transcript = writeTranscript([transcriptMessage("user", PROMPT), assistantText(RESULT_BLOCK, true)]);

      expectBlocked(await runGate({ transcript_path: transcript }));
    });

    it("ignores a block inside a tool call input", async () => {
      const transcript = writeTranscript([
        transcriptMessage("assistant", [
          {
            type: "tool_use",
            id: "toolu_1",
            name: "Write",
            input: { file_path: "/workspace/x.md", content: RESULT_BLOCK },
          },
        ]),
      ]);

      expectBlocked(await runGate({ transcript_path: transcript }));
    });
  });

  describe("background tasks", () => {
    it("allows the stop while a background task is still running", async () => {
      const run = await runGate({
        background_tasks: [
          { id: "b1", status: "completed" },
          { id: "b2", status: "running" },
        ],
      });

      expectAllowed(run);
    });

    it("still blocks when every background task has finished", async () => {
      expectBlocked(await runGate({ background_tasks: [{ id: "b1", status: "completed" }] }));
    });
  });

  describe("loop safety", () => {
    it("allows a stop that continues a block it has no count for", async () => {
      const run = await runGate({ stop_hook_active: true });

      expectAllowed(run);
      expect(sandbox.read("audit.jsonl")).toBe("");
    });

    it("allows the stop when the stored block count is corrupt", async () => {
      writeFileSync(join(sandbox.logDir, `.result-gate-${SESSION}`), "garbage\n");

      expectAllowed(await runGate());
      expect(sandbox.audit()).toEqual([expect.objectContaining({ event: "result_gate_exhausted", blocks: 2 })]);
    });

    it("allows the stop when the block count cannot be stored", async () => {
      mkdirSync(join(sandbox.logDir, `.result-gate-${SESSION}`));

      const run = await runGate();

      expectAllowed(run);
      expect(run.stderr).toContain("ralph hook result_gate (claude)");
    });

    it("allows the stop and records hook_error for a malformed payload", async () => {
      const run = await sandbox.run(GATE, [], '{"session_id": ', GATE_ON);

      expectAllowed(run);
      expect(sandbox.audit()).toEqual([expect.objectContaining({ event: "hook_error", hook: "result_gate" })]);
    });

    it("keeps session ids from escaping the log directory", async () => {
      await runGate({ session_id: "../../etc/passwd" });

      expect(sandbox.read(".result-gate-______etc_passwd")).toBe("1\n");
    });
  });
});
