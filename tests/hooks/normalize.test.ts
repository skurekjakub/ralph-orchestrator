import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { HookSandbox, loadCapturedPreToolUse, loadPayloads, type AuditRecord, type HookRun } from "./hook-harness.js";

const claude = loadPayloads("claude");
const copilot = loadPayloads("copilot");

/** Keys every v2 record carries, in addition to the per-event keys. */
const COMMON_KEYS = ["schemaVersion", "event", "timestamp", "session", "cli", "agent", "agentId"];
const TOOL_KEYS = ["tool", "toolUseId", "toolKind", "mcpServer", "mcpTool", "subagent", "skill", "args"];

describe("lib/normalize.sh", () => {
  let sandbox: HookSandbox;

  beforeEach(() => {
    sandbox = new HookSandbox();
  });

  afterEach(() => {
    sandbox.cleanup();
  });

  async function normalize(
    cli: "claude" | "copilot",
    event: string,
    payload: unknown,
    options: { failure?: boolean; env?: Record<string, string> } = {},
  ): Promise<AuditRecord> {
    const args = options.failure ? [cli, event, "--failure"] : [cli, event];
    const run: HookRun = await sandbox.runJson("lib/normalize.sh", args, payload, options.env);
    expect(run.stderr).toBe("");
    expect(run.exitCode).toBe(0);
    return JSON.parse(run.stdout);
  }

  describe("Claude Code adapter", () => {
    it("maps every captured PreToolUse payload to a v2 pre_tool record", async () => {
      for (const payload of loadCapturedPreToolUse()) {
        const record = await normalize("claude", "pre_tool", payload);
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
      }
    });

    it("stamps records with the hook's clock because Claude Code payloads carry no timestamp", async () => {
      const before = Date.now();
      const record = await normalize("claude", "pre_tool", claude.preToolUseSkill);
      const after = Date.now();

      expect(record.timestamp).toBeGreaterThanOrEqual(before);
      expect(record.timestamp).toBeLessThanOrEqual(after);
    });

    it("names the skill of a Skill call", async () => {
      const record = await normalize("claude", "pre_tool", claude.preToolUseSkill);

      expect(record).toMatchObject({ toolKind: "skill", skill: "ralph-echo", subagent: null, agent: "orch" });
    });

    it("splits an MCP tool name into server and tool", async () => {
      const record = await normalize("claude", "pre_tool", claude.preToolUseMcp);

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
      const record = await normalize("claude", "pre_tool", {
        ...claude.preToolUseMcp,
        tool_name: "mcp__jira-kentico__jira__get_issue",
      });

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
      const record = await normalize("claude", "pre_tool", { ...claude.preToolUseSkill, tool_name: tool });

      expect(record.toolKind).toBe(kind);
      expect(record.mcpServer).toBeNull();
    });

    it("takes the Bash result from stdout and the duration from duration_ms", async () => {
      const record = await normalize("claude", "post_tool", claude.postToolUseBash);

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
      const record = await normalize("claude", "post_tool", {
        ...claude.postToolUseBash,
        tool_response: { stdout: "out", stderr: "warn", interrupted: false },
      });

      expect(record.resultText).toBe("out\nwarn");
    });

    it("takes a subagent result from its text content blocks", async () => {
      const record = await normalize("claude", "post_tool", claude.postToolUseAgent);

      expect(record).toMatchObject({ toolKind: "subagent", subagent: "helper", resultText: "4", durationMs: 3120 });
    });

    it("joins the text blocks of an MCP result", async () => {
      const record = await normalize("claude", "post_tool", claude.postToolUseMcp);

      expect(record.resultText).toBe("Pushed 2 files to ralph/DOC-3141");
    });

    it("takes a Read result from the file content", async () => {
      const record = await normalize("claude", "post_tool", claude.postToolUseRead);

      expect(record).toMatchObject({ toolKind: "file", resultText: "# Docs\n" });
    });

    it("serialises other structured results without the pre-edit file body", async () => {
      const record = await normalize("claude", "post_tool", claude.postToolUseEdit);
      const result = JSON.parse(record.resultText as string);

      expect(result).toMatchObject({ filePath: "/workspace/README.md", newString: "# Product docs" });
      expect(result).not.toHaveProperty("originalFile");
    });

    it("records a PostToolUseFailure as a failure carrying the error text", async () => {
      const record = await normalize("claude", "post_tool", claude.postToolUseFailure, { failure: true });

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

    it("maps session, prompt and stop-failure payloads captured from Claude Code", async () => {
      await expect(normalize("claude", "session_start", claude.sessionStart)).resolves.toMatchObject({
        event: "session_start",
        session: "1211139f-0de2-419c-964c-b5017fd1ccc2",
        source: "startup",
        initialPrompt: "",
        cwd: "/workspace",
        agent: null,
      });
      await expect(normalize("claude", "prompt", claude.userPromptSubmit)).resolves.toMatchObject({
        event: "prompt",
        prompt: "say hi\n",
      });
      await expect(normalize("claude", "error", claude.stopFailure)).resolves.toMatchObject({
        event: "error",
        errorName: "authentication_failed",
        errorMsg: "Not logged in · Please run /login",
        errorStack: "",
      });
      await expect(normalize("claude", "session_end", claude.sessionEnd)).resolves.toMatchObject({
        event: "session_end",
        reason: "other",
        cwd: "/workspace",
      });
    });

    it("attributes subagent lifecycle records to the subagent", async () => {
      await expect(normalize("claude", "subagent_start", claude.subagentStart)).resolves.toMatchObject({
        event: "subagent_start",
        agent: "helper",
        agentId: "a2d45f3a31ba3dd20",
        subagent: "helper",
      });
      await expect(normalize("claude", "subagent_stop", claude.subagentStop)).resolves.toMatchObject({
        event: "subagent_stop",
        subagent: "helper",
        agentId: "a2d45f3a31ba3dd20",
        lastMessage: "4",
      });
    });

    it("records the compaction trigger", async () => {
      const record = await normalize("claude", "compact", claude.preCompact);

      expect(record).toMatchObject({ event: "compact", trigger: "auto", agent: "orch" });
    });

    it("falls back to defaults when fields are missing", async () => {
      await expect(normalize("claude", "pre_tool", {})).resolves.toMatchObject({
        session: "unknown",
        agent: null,
        agentId: null,
        tool: "unknown",
        toolUseId: null,
        toolKind: "other",
        args: "{}",
      });
      await expect(normalize("claude", "post_tool", {})).resolves.toMatchObject({
        resultType: "success",
        resultText: "",
        durationMs: null,
      });
      await expect(normalize("claude", "session_end", {})).resolves.toMatchObject({ reason: "unknown", cwd: "" });
    });

    it("serialises unexpected field types instead of breaking the record shape", async () => {
      const record = await normalize("claude", "pre_tool", {
        ...claude.preToolUseSkill,
        tool_name: { nested: true },
        session_id: 42,
      });

      expect(record).toMatchObject({ tool: '{"nested":true}', session: "42" });
    });
  });

  describe("Copilot CLI adapter", () => {
    it("keeps the payload timestamp and today's v1 keys", async () => {
      const record = await normalize("copilot", "post_tool", copilot.postToolUseBash);

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
      await sandbox.run("log-session-start.sh", [], JSON.stringify(copilot.sessionStart));
      const minted = sandbox.read(".current-session-id").trim();

      const record = await normalize("copilot", "pre_tool", copilot.preToolUseBash);

      expect(minted).toMatch(/^ralph-\d{8}-\d{6}$/);
      expect(record.session).toBe(minted);
    });

    it("names the subagent of a task call and keeps pretty-printed arguments verbatim", async () => {
      const record = await normalize("copilot", "pre_tool", copilot.preToolUseTask);

      expect(record).toMatchObject({
        toolKind: "subagent",
        subagent: "ralph.malph-scout",
        args: copilot.preToolUseTask.toolArgs,
      });
    });

    it("names the skill of a skill call", async () => {
      const record = await normalize("copilot", "pre_tool", copilot.preToolUseSkill);

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
      const record = await normalize("copilot", "pre_tool", { ...copilot.preToolUseMcp, toolName: tool });

      expect(record).toMatchObject({ toolKind: kind, mcpServer: null, mcpTool: null });
    });

    it("maps errors and session boundaries", async () => {
      await expect(normalize("copilot", "error", copilot.errorOccurred)).resolves.toMatchObject({
        event: "error",
        errorName: "RateLimitError",
        errorMsg: "429 Too Many Requests",
        errorStack: copilot.errorOccurred.error ? (copilot.errorOccurred.error as Record<string, string>).stack : "",
      });
      await expect(normalize("copilot", "session_start", copilot.sessionStart)).resolves.toMatchObject({
        source: "new",
        initialPrompt: "Process DOC-3141",
        cwd: "/workspace",
      });
      await expect(normalize("copilot", "session_end", copilot.sessionEnd)).resolves.toMatchObject({
        reason: "complete",
      });
    });

    it("parses a string timestamp and falls back to the hook clock without one", async () => {
      const before = Date.now();
      const parsed = await normalize("copilot", "prompt", {
        ...copilot.userPromptSubmitted,
        timestamp: "1791321200500",
      });
      const missing = await normalize("copilot", "prompt", { prompt: "x" });

      expect(parsed.timestamp).toBe(1791321200500);
      expect(missing.timestamp).toBeGreaterThanOrEqual(before);
    });

    it("falls back to today's defaults when fields are missing", async () => {
      await expect(normalize("copilot", "post_tool", {})).resolves.toMatchObject({
        tool: "unknown",
        args: "{}",
        resultType: "unknown",
        resultText: "",
      });
      await expect(normalize("copilot", "error", {})).resolves.toMatchObject({
        errorName: "UnknownError",
        errorMsg: "",
        errorStack: "",
      });
    });
  });

  describe("record shape across CLIs", () => {
    const pairs: [string, string, string, boolean][] = [
      ["session_start", "sessionStart", "sessionStart", false],
      ["prompt", "userPromptSubmit", "userPromptSubmitted", false],
      ["pre_tool", "preToolUseSkill", "preToolUseSkill", false],
      ["post_tool", "postToolUseBash", "postToolUseBash", false],
      ["post_tool", "postToolUseFailure", "postToolUseFailure", true],
      ["error", "stopFailure", "errorOccurred", false],
      ["session_end", "sessionEnd", "sessionEnd", false],
    ];

    it.each(pairs)("gives %s records the same keys for both CLIs", async (event, claudeKey, copilotKey, failure) => {
      const fromClaude = await normalize("claude", event, claude[claudeKey], { failure });
      const fromCopilot = await normalize("copilot", event, copilot[copilotKey]);

      expect(Object.keys(fromClaude)).toEqual(Object.keys(fromCopilot));
      expect(Object.keys(fromClaude).slice(0, COMMON_KEYS.length)).toEqual(COMMON_KEYS);
    });

    it("describes the same logical tool call identically apart from CLI identity", async () => {
      const fromClaude = await normalize("claude", "post_tool", claude.postToolUseBash);
      const fromCopilot = await normalize("copilot", "post_tool", copilot.postToolUseBash);
      const cliIndependent = ["event", "toolKind", "mcpServer", "mcpTool", "subagent", "skill", "resultType"];

      for (const key of [...cliIndependent, "resultText"]) {
        expect(fromClaude[key], key).toEqual(fromCopilot[key]);
      }
      expect(JSON.parse(fromClaude.args as string)).toEqual(JSON.parse(fromCopilot.args as string));
      expect(Object.keys(fromClaude)).toEqual([...COMMON_KEYS, ...TOOL_KEYS, "resultType", "resultText", "durationMs"]);
    });
  });

  describe("redaction", () => {
    it("scrubs the literal values of credential variables in the hook environment", async () => {
      const token = "oauth-value-0123456789";
      const record = await normalize(
        "claude",
        "post_tool",
        {
          ...claude.postToolUseBash,
          tool_input: { command: "env" },
          tool_response: { stdout: `CLAUDE_CODE_OAUTH_TOKEN=${token}\nX=${token}`, stderr: "" },
        },
        { env: { CLAUDE_CODE_OAUTH_TOKEN: token, NODE_PATH: "/usr/lib/node_modules" } },
      );

      expect(record.resultText).toBe("CLAUDE_CODE_OAUTH_TOKEN=[REDACTED]\nX=[REDACTED]");
      expect(JSON.stringify(record)).not.toContain(token);
    });

    it("leaves the values of non-credential variables alone", async () => {
      const record = await normalize(
        "claude",
        "pre_tool",
        { ...claude.preToolUseSkill, tool_input: { path: "/usr/lib/node_modules/x" } },
        { env: { NODE_PATH: "/usr/lib/node_modules" } },
      );

      expect(record.args).toBe('{"path":"/usr/lib/node_modules/x"}');
    });

    it.each([
      ["an Anthropic key", "key sk-ant-api03-AbCdEf0123456789_xyz end", "key [REDACTED] end"],
      ["a GitHub token", "token ghp_0123456789abcdefghijABCDEFGHIJ end", "token [REDACTED] end"],
      ["a fine-grained GitHub PAT", "github_pat_11ABCDEFG0123456789_abcdefghijklmnop", "[REDACTED]"],
      [
        "an Authorization header",
        "curl -H 'Authorization: Bearer abc.def.ghi' x",
        "curl -H 'Authorization: Bearer [REDACTED]' x",
      ],
      [
        "a git extraheader",
        "http.extraheader=AUTHORIZATION: basic dXNlcjpwYXQ=",
        "http.extraheader=AUTHORIZATION: basic [REDACTED]",
      ],
      [
        "a URL password",
        "git clone https://ralph:s3cr3tvalue@dev.azure.com/org",
        "git clone https://ralph:[REDACTED]@dev.azure.com/org",
      ],
      ["an env assignment", "export ADO_PAT=abcdefgh12345 && run", "export ADO_PAT=[REDACTED] && run"],
      ["a JSON credential field", '{"api_key": "abcdefghijk", "name": "x"}', '{"api_key": "[REDACTED]", "name": "x"}'],
    ])("scrubs %s", async (_label, text, expected) => {
      const record = await normalize("copilot", "post_tool", {
        ...copilot.postToolUseBash,
        toolResult: { resultType: "success", textResultForLlm: text },
      });

      expect(record.resultText).toBe(expected);
    });

    it("keeps variable references and token counts readable", async () => {
      const text = 'echo GH_TOKEN=$GH_TOKEN; {"input_tokens": 123456789, "max_tokens": 64000}';
      const record = await normalize("copilot", "post_tool", {
        ...copilot.postToolUseBash,
        toolResult: { resultType: "success", textResultForLlm: text },
      });

      expect(record.resultText).toBe(text);
    });

    it("scrubs tool arguments, prompts and error messages too", async () => {
      const secret = "ghp_0123456789abcdefghijABCDEFGHIJ";
      const pre = await normalize("claude", "pre_tool", {
        ...claude.preToolUseSkill,
        tool_name: "Bash",
        tool_input: { command: `gh auth login --with-token ${secret}` },
      });
      const prompt = await normalize("copilot", "prompt", { ...copilot.userPromptSubmitted, prompt: `use ${secret}` });
      const error = await normalize("copilot", "error", {
        ...copilot.errorOccurred,
        error: { name: "E", message: `bad ${secret}`, stack: `at ${secret}` },
      });

      expect(JSON.stringify([pre, prompt, error])).not.toContain(secret);
    });
  });

  describe("truncation", () => {
    it("cuts audit result text at 2000 characters but keeps arguments whole", async () => {
      const longArgs = JSON.stringify({ command: "x".repeat(5000) });
      const record = await normalize("copilot", "post_tool", {
        ...copilot.postToolUseBash,
        toolArgs: longArgs,
        toolResult: { resultType: "success", textResultForLlm: "é".repeat(2500) },
      });

      expect(record.resultText).toBe(`${"é".repeat(2000)}...[truncated]`);
      expect(record.args).toBe(longArgs);
    });
  });

  describe("unhappy paths", () => {
    it("exits non-zero for a payload that is not a JSON object", async () => {
      const run = await sandbox.run("lib/normalize.sh", ["claude", "pre_tool"], "[1,2]");

      expect(run.exitCode).not.toBe(0);
      expect(run.stderr).toContain("payload is not a JSON object");
    });

    it("exits non-zero for malformed JSON", async () => {
      const run = await sandbox.run("lib/normalize.sh", ["copilot", "pre_tool"], '{"toolName": ');

      expect(run.exitCode).not.toBe(0);
      expect(run.stdout).toBe("");
    });

    it("rejects events the CLI never emits", async () => {
      const run = await sandbox.runJson("lib/normalize.sh", ["copilot", "subagent_start"], {});

      expect(run.exitCode).not.toBe(0);
      expect(run.stderr).toContain("Copilot CLI emits no subagent_start hook");
    });

    it("prints usage for an unknown CLI", async () => {
      const run = await sandbox.runJson("lib/normalize.sh", ["gemini", "pre_tool"], {});

      expect(run.exitCode).toBe(64);
      expect(run.stderr).toContain("usage:");
    });
  });
});
