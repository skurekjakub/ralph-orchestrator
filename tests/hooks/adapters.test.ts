import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { HookSandbox, loadCapturedPreToolUse, loadPayloads, type AuditRecord } from "./hook-harness";

const claude = loadPayloads("claude");
const copilot = loadPayloads("copilot");

/** Keys every v2 record carries, in addition to the per-event keys. */
const COMMON_KEYS = ["schemaVersion", "event", "timestamp", "session", "cli", "agent", "agentId"];
const TOOL_KEYS = ["tool", "toolUseId", "toolKind", "mcpServer", "mcpTool", "subagent", "skill", "args"];

describe("lib/adapters (payload → v2 audit record)", () => {
  let sandbox: HookSandbox;

  beforeEach(() => {
    sandbox = new HookSandbox();
  });

  afterEach(() => {
    sandbox.cleanup();
  });

  /** Runs the real entry script for `cli` and returns the record it wrote. */
  function recordFrom(
    cli: "claude" | "copilot",
    script: string,
    payload: unknown,
    env: Record<string, string> = {},
  ): Promise<AuditRecord> {
    return sandbox.recordOf(script, cli === "claude" ? ["--cli", "claude"] : [], payload, env);
  }

  describe("Claude Code adapter", () => {
    it("maps every captured PreToolUse payload to a v2 pre_tool record", async () => {
      // Arrange
      const payloads = loadCapturedPreToolUse();

      // Act
      const records: AuditRecord[] = [];
      for (const payload of payloads) {
        records.push(await recordFrom("claude", "log-pre-tool.sh", payload));
      }

      // Assert
      records.forEach((record, index) => {
        const payload = payloads[index];
        const input = payload.tool_input as Record<string, unknown>;
        expect(record).toMatchObject({
          schemaVersion: 2,
          event: "pre_tool",
          session: payload.session_id,
          cli: "claude",
          agent: payload.agent_type,
          agentId: payload.agent_id ?? null,
          tool: payload.tool_name,
          toolUseId: payload.tool_use_id,
          args: JSON.stringify(input),
        });
        expect(record.toolKind).toBe(payload.tool_name === "Agent" ? "subagent" : "shell");
        expect(record.subagent).toBe(payload.tool_name === "Agent" ? input.subagent_type : null);
      });
    });

    it("stamps records with the hook's clock because Claude Code payloads carry no timestamp", async () => {
      // Arrange
      const before = Date.now();

      // Act
      const record = await recordFrom("claude", "log-pre-tool.sh", claude.preToolUseSkill);

      // Assert
      expect(record.timestamp).toBeGreaterThanOrEqual(before);
      expect(record.timestamp).toBeLessThanOrEqual(Date.now());
    });

    it("names the skill of a Skill call", async () => {
      // Act
      const record = await recordFrom("claude", "log-pre-tool.sh", claude.preToolUseSkill);

      // Assert
      expect(record).toMatchObject({ toolKind: "skill", skill: "ralph-echo", subagent: null, agent: "orch" });
    });

    it("splits an MCP tool name into server and tool", async () => {
      // Act
      const record = await recordFrom("claude", "log-pre-tool.sh", claude.preToolUseMcp);

      // Assert
      expect(record).toMatchObject({
        tool: "mcp__ado__ado_push_progress",
        toolKind: "mcp",
        mcpServer: "ado",
        mcpTool: "ado_push_progress",
        agent: "ralph-writer",
        agentId: "a2d04af995c61fd80",
      });
    });

    it("keeps double underscores inside the MCP tool part", async () => {
      // Arrange
      const payload = { ...claude.preToolUseMcp, tool_name: "mcp__jira-kentico__jira__get_issue" };

      // Act
      const record = await recordFrom("claude", "log-pre-tool.sh", payload);

      // Assert
      expect(record).toMatchObject({ mcpServer: "jira-kentico", mcpTool: "jira__get_issue" });
    });

    it.each([
      ["Bash", "shell"],
      ["Read", "file"],
      ["Write", "file"],
      ["Edit", "file"],
      ["NotebookEdit", "file"],
      ["Task", "subagent"],
      ["TaskCreate", "other"],
      ["WebFetch", "other"],
    ])("classifies %s as %s", async (tool, kind) => {
      // Act
      const record = await recordFrom("claude", "log-pre-tool.sh", { ...claude.preToolUseSkill, tool_name: tool });

      // Assert
      expect(record.toolKind).toBe(kind);
      expect(record.mcpServer).toBeNull();
    });

    it("takes the Bash result from stdout and the duration from duration_ms", async () => {
      // Act
      const record = await recordFrom("claude", "log-post-tool.sh", claude.postToolUseBash);

      // Assert
      expect(record).toMatchObject({
        event: "post_tool",
        tool: "Bash",
        toolKind: "shell",
        resultType: "success",
        resultText: "ralph-bash-ok",
        durationMs: 412,
      });
    });

    it("joins stderr after stdout when a command writes both", async () => {
      // Arrange
      const payload = {
        ...claude.postToolUseBash,
        tool_response: { stdout: "out", stderr: "warn", interrupted: false },
      };

      // Act
      const record = await recordFrom("claude", "log-post-tool.sh", payload);

      // Assert
      expect(record.resultText).toBe("out\nwarn");
    });

    it("takes a subagent result from its text content blocks", async () => {
      // Act
      const record = await recordFrom("claude", "log-post-tool.sh", claude.postToolUseAgent);

      // Assert
      expect(record).toMatchObject({ toolKind: "subagent", subagent: "helper", resultText: "4", durationMs: 3120 });
    });

    it("joins the text blocks of an MCP result", async () => {
      // Act
      const record = await recordFrom("claude", "log-post-tool.sh", claude.postToolUseMcp);

      // Assert
      expect(record.resultText).toBe("Pushed 2 files to ralph/DOC-3141");
    });

    it("takes a Read result from the file content", async () => {
      // Act
      const record = await recordFrom("claude", "log-post-tool.sh", claude.postToolUseRead);

      // Assert
      expect(record).toMatchObject({ toolKind: "file", resultText: "# Docs\n" });
    });

    it("serialises other structured results without the pre-edit file body", async () => {
      // Act
      const record = await recordFrom("claude", "log-post-tool.sh", claude.postToolUseEdit);

      // Assert
      const result = JSON.parse(record.resultText as string);
      expect(result).toMatchObject({ filePath: "/workspace/README.md", newString: "# Product docs" });
      expect(result).not.toHaveProperty("originalFile");
    });

    it("records a PostToolUseFailure payload as a failure carrying the error text", async () => {
      // Act
      const record = await recordFrom("claude", "log-post-tool.sh", claude.postToolUseFailure);

      // Assert
      expect(record).toMatchObject({
        resultType: "failure",
        resultText: "Agent type 'leaf' not found. Available agents: helper",
        toolKind: "subagent",
        subagent: "leaf",
        agent: "helper",
        agentId: "a2d45f3a31ba3dd20",
        durationMs: null,
      });
    });

    it("takes the result type from hook_event_name rather than from the payload's fields", async () => {
      // Arrange
      const payload = { ...claude.postToolUseFailure, hook_event_name: "PostToolUse" };

      // Act
      const record = await recordFrom("claude", "log-post-tool.sh", payload);

      // Assert
      expect(record).toMatchObject({ resultType: "success", resultText: "" });
    });

    it("maps session, prompt and stop-failure payloads captured from Claude Code", async () => {
      // Act
      const start = await recordFrom("claude", "log-session-start.sh", claude.sessionStart);
      const prompt = await recordFrom("claude", "log-prompt.sh", claude.userPromptSubmit);
      const error = await recordFrom("claude", "log-error.sh", claude.stopFailure);
      const end = await recordFrom("claude", "log-session-end.sh", claude.sessionEnd);

      // Assert
      expect(start).toMatchObject({
        event: "session_start",
        session: "1211139f-0de2-419c-964c-b5017fd1ccc2",
        source: "startup",
        initialPrompt: "",
        cwd: "/workspace",
        agent: null,
      });
      expect(prompt).toMatchObject({ event: "prompt", prompt: "say hi\n" });
      expect(error).toMatchObject({
        event: "error",
        errorName: "authentication_failed",
        errorMsg: "Not logged in · Please run /login",
        errorStack: "",
      });
      expect(end).toMatchObject({ event: "session_end", reason: "other", cwd: "/workspace" });
    });

    it("derives subagent start and stop from hook_event_name and attributes them to the subagent", async () => {
      // Act
      const start = await recordFrom("claude", "log-subagent.sh", claude.subagentStart);
      const stop = await recordFrom("claude", "log-subagent.sh", claude.subagentStop);

      // Assert
      expect(start).toMatchObject({
        event: "subagent_start",
        agent: "helper",
        agentId: "a2d45f3a31ba3dd20",
        subagent: "helper",
      });
      expect(stop).toMatchObject({
        event: "subagent_stop",
        subagent: "helper",
        agentId: "a2d45f3a31ba3dd20",
        lastMessage: "4",
      });
    });

    it("records the compaction trigger", async () => {
      // Act
      const record = await recordFrom("claude", "log-compact.sh", claude.preCompact);

      // Assert
      expect(record).toMatchObject({ event: "compact", trigger: "auto", agent: "orch" });
    });

    it("falls back to defaults when fields other than hook_event_name are missing", async () => {
      // Act
      const pre = await recordFrom("claude", "log-pre-tool.sh", { hook_event_name: "PreToolUse" });
      const post = await recordFrom("claude", "log-post-tool.sh", { hook_event_name: "PostToolUse" });
      const end = await recordFrom("claude", "log-session-end.sh", { hook_event_name: "SessionEnd" });

      // Assert
      expect(pre).toMatchObject({
        session: "unknown",
        agent: null,
        agentId: null,
        tool: "unknown",
        toolUseId: null,
        toolKind: "other",
        args: "{}",
      });
      expect(post).toMatchObject({ resultType: "success", resultText: "", durationMs: null });
      expect(end).toMatchObject({ reason: "unknown", cwd: "" });
    });

    it("serialises unexpected field types instead of breaking the record shape", async () => {
      // Arrange
      const payload = { ...claude.preToolUseSkill, tool_name: { nested: true }, session_id: 42 };

      // Act
      const record = await recordFrom("claude", "log-pre-tool.sh", payload);

      // Assert
      expect(record).toMatchObject({ tool: '{"nested":true}', session: "42" });
    });
  });

  describe("Copilot CLI adapter", () => {
    it("keeps the payload timestamp and today's v1 keys", async () => {
      // Act
      const record = await recordFrom("copilot", "log-post-tool.sh", copilot.postToolUseBash);

      // Assert
      expect(record).toMatchObject({
        schemaVersion: 2,
        event: "post_tool",
        timestamp: 1791321203400,
        session: "unknown",
        cli: "copilot",
        agent: null,
        agentId: null,
        tool: "bash",
        toolUseId: null,
        toolKind: "shell",
        args: copilot.postToolUseBash.toolArgs,
        resultType: "success",
        resultText: "ralph-bash-ok",
        durationMs: null,
      });
    });

    it("takes the session from the id minted at sessionStart", async () => {
      // Arrange
      await sandbox.runJson("log-session-start.sh", [], copilot.sessionStart);
      const minted = sandbox.read(".current-session-id").trim();

      // Act
      const record = await recordFrom("copilot", "log-pre-tool.sh", copilot.preToolUseBash);

      // Assert
      expect(minted).toMatch(/^ralph-\d{8}-\d{6}$/);
      expect(record.session).toBe(minted);
    });

    it("names the subagent of a task call and keeps pretty-printed arguments verbatim", async () => {
      // Act
      const record = await recordFrom("copilot", "log-pre-tool.sh", copilot.preToolUseTask);

      // Assert
      expect(record).toMatchObject({
        toolKind: "subagent",
        subagent: "ralph.malph-scout",
        args: copilot.preToolUseTask.toolArgs,
      });
    });

    it("names the skill of a skill call", async () => {
      // Act
      const record = await recordFrom("copilot", "log-pre-tool.sh", copilot.preToolUseSkill);

      // Assert
      expect(record).toMatchObject({ toolKind: "skill", skill: "malph-vscode-workflow-setup" });
    });

    it.each([
      ["view", "file"],
      ["create", "file"],
      ["edit", "file"],
      ["read_bash", "shell"],
      ["ado-ado_push_progress", "other"],
      ["web_fetch", "other"],
    ])("classifies %s as %s", async (tool, kind) => {
      // Act
      const record = await recordFrom("copilot", "log-pre-tool.sh", { ...copilot.preToolUseMcp, toolName: tool });

      // Assert
      expect(record).toMatchObject({ toolKind: kind, mcpServer: null, mcpTool: null });
    });

    it("maps errors and session boundaries", async () => {
      // Arrange
      const stack = (copilot.errorOccurred.error as Record<string, string>).stack;

      // Act
      const error = await recordFrom("copilot", "log-error.sh", copilot.errorOccurred);
      const start = await recordFrom("copilot", "log-session-start.sh", copilot.sessionStart);
      const end = await recordFrom("copilot", "log-session-end.sh", copilot.sessionEnd);

      // Assert
      expect(error).toMatchObject({
        event: "error",
        errorName: "RateLimitError",
        errorMsg: "429 Too Many Requests",
        errorStack: stack,
      });
      expect(start).toMatchObject({ source: "new", initialPrompt: "Process DOC-3141", cwd: "/workspace" });
      expect(end).toMatchObject({ reason: "complete" });
    });

    it("parses a string timestamp and falls back to the hook clock without one", async () => {
      // Arrange
      const before = Date.now();

      // Act
      const parsed = await recordFrom("copilot", "log-prompt.sh", {
        ...copilot.userPromptSubmitted,
        timestamp: "1791321200500",
      });
      const missing = await recordFrom("copilot", "log-prompt.sh", { prompt: "x" });

      // Assert
      expect(parsed.timestamp).toBe(1791321200500);
      expect(missing.timestamp).toBeGreaterThanOrEqual(before);
    });

    it("falls back to today's defaults when fields are missing", async () => {
      // Act
      const post = await recordFrom("copilot", "log-post-tool.sh", {});
      const error = await recordFrom("copilot", "log-error.sh", {});

      // Assert
      expect(post).toMatchObject({ tool: "unknown", args: "{}", resultType: "unknown", resultText: "" });
      expect(error).toMatchObject({ errorName: "UnknownError", errorMsg: "", errorStack: "" });
    });
  });

  describe("record shape across CLIs", () => {
    it.each([
      ["log-session-start.sh", "sessionStart", "sessionStart"],
      ["log-prompt.sh", "userPromptSubmit", "userPromptSubmitted"],
      ["log-pre-tool.sh", "preToolUseSkill", "preToolUseSkill"],
      ["log-post-tool.sh", "postToolUseBash", "postToolUseBash"],
      ["log-post-tool.sh", "postToolUseFailure", "postToolUseFailure"],
      ["log-error.sh", "stopFailure", "errorOccurred"],
      ["log-session-end.sh", "sessionEnd", "sessionEnd"],
    ])("gives %s records the same keys for both CLIs (%s)", async (script, claudeKey, copilotKey) => {
      // Act
      const fromClaude = await recordFrom("claude", script, claude[claudeKey]);
      const fromCopilot = await recordFrom("copilot", script, copilot[copilotKey]);

      // Assert
      expect(Object.keys(fromClaude)).toEqual(Object.keys(fromCopilot));
      expect(Object.keys(fromClaude).slice(0, COMMON_KEYS.length)).toEqual(COMMON_KEYS);
    });

    it("describes the same logical tool call identically apart from CLI identity", async () => {
      // Arrange
      const cliIndependent = ["event", "toolKind", "mcpServer", "mcpTool", "subagent", "skill", "resultType"];

      // Act
      const fromClaude = await recordFrom("claude", "log-post-tool.sh", claude.postToolUseBash);
      const fromCopilot = await recordFrom("copilot", "log-post-tool.sh", copilot.postToolUseBash);

      // Assert
      for (const key of [...cliIndependent, "resultText"]) {
        expect(fromClaude[key], key).toEqual(fromCopilot[key]);
      }
      expect(JSON.parse(fromClaude.args as string)).toEqual(JSON.parse(fromCopilot.args as string));
      expect(Object.keys(fromClaude)).toEqual([...COMMON_KEYS, ...TOOL_KEYS, "resultType", "resultText", "durationMs"]);
    });
  });
});
