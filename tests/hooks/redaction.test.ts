import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { HookSandbox, loadPayloads } from "./hook-harness";

const claude = loadPayloads("claude");
const copilot = loadPayloads("copilot");
const CLAUDE = ["--cli", "claude"];
const GITHUB_TOKEN = "ghp_0123456789abcdefghijABCDEFGHIJ";

describe("lib/redact.pl", () => {
  let sandbox: HookSandbox;

  beforeEach(() => {
    sandbox = new HookSandbox();
  });

  afterEach(() => {
    sandbox.cleanup();
  });

  /** Copilot postToolUse payload whose tool returned `text`. */
  function copilotResult(text: string): Record<string, unknown> {
    return { ...copilot.postToolUseBash, toolResult: { resultType: "success", textResultForLlm: text } };
  }

  /** Claude Code PostToolUse payload whose Bash call printed `stdout`. */
  function claudeBashResult(stdout: string): Record<string, unknown> {
    return { ...claude.postToolUseBash, tool_input: { command: "env" }, tool_response: { stdout, stderr: "" } };
  }

  describe("credential scrubbing", () => {
    it("scrubs the literal values of credential variables in the hook environment", async () => {
      // Arrange
      const token = "oauth-value-0123456789";
      const env = { CLAUDE_CODE_OAUTH_TOKEN: token, NODE_PATH: "/usr/lib/node_modules" };

      // Act
      const record = await sandbox.recordOf(
        "log-post-tool.sh",
        CLAUDE,
        claudeBashResult(`CLAUDE_CODE_OAUTH_TOKEN=${token}\nX=${token}`),
        env,
      );

      // Assert
      expect(record.resultText).toBe("CLAUDE_CODE_OAUTH_TOKEN=[REDACTED]\nX=[REDACTED]");
      expect(sandbox.read("audit.jsonl")).not.toContain(token);
      expect(sandbox.read("tool-output.log")).toContain("X=[REDACTED]\n");
      expect(sandbox.read("tool-output.log")).not.toContain(token);
    });

    it("leaves the values of non-credential variables alone", async () => {
      // Arrange
      const payload = { ...claude.preToolUseSkill, tool_input: { path: "/usr/lib/node_modules/x" } };

      // Act
      const record = await sandbox.recordOf("log-pre-tool.sh", CLAUDE, payload, { NODE_PATH: "/usr/lib/node_modules" });

      // Assert
      expect(record.args).toBe('{"path":"/usr/lib/node_modules/x"}');
    });

    it("replaces a credential value that contains another one whole", async () => {
      // Arrange
      const env = { SHORT_TOKEN: "abcdefgh", LONG_SECRET: "abcdefgh-and-a-longer-tail" };

      // Act
      const record = await sandbox.recordOf(
        "log-post-tool.sh",
        [],
        copilotResult("v=abcdefgh-and-a-longer-tail;"),
        env,
      );

      // Assert
      expect(record.resultText).toBe("v=[REDACTED];");
    });

    it.each([
      ["an Anthropic key", "key sk-ant-api03-AbCdEf0123456789_xyz end", "key [REDACTED] end"],
      ["a GitHub token", `token ${GITHUB_TOKEN} end`, "token [REDACTED] end"],
      ["a GitHub token after a newline", `first line\n${GITHUB_TOKEN}`, "first line\n[REDACTED]"],
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
      [
        "an escaped JSON credential field",
        '{\\"client_secret\\":\\"abcdefghijk\\"}',
        '{\\"client_secret\\":\\"[REDACTED]\\"}',
      ],
    ])("scrubs %s", async (_label, text, expected) => {
      // Act
      const record = await sandbox.recordOf("log-post-tool.sh", [], copilotResult(text));

      // Assert
      expect(record.resultText).toBe(expected);
    });

    it("scrubs an Authorization header passed as a tool argument object", async () => {
      // Arrange
      const payload = {
        ...claude.preToolUseMcp,
        tool_input: { url: "https://example.com", headers: { Authorization: "Bearer abc.def.ghi" } },
      };

      // Act
      const record = await sandbox.recordOf("log-pre-tool.sh", CLAUDE, payload);

      // Assert
      expect(record.args).toBe('{"url":"https://example.com","headers":{"Authorization":"Bearer [REDACTED]"}}');
    });

    it("keeps variable references and token counts readable", async () => {
      // Arrange
      const text = 'echo GH_TOKEN=$GH_TOKEN; {"input_tokens": 123456789, "max_tokens": 64000}';

      // Act
      const record = await sandbox.recordOf("log-post-tool.sh", [], copilotResult(text));

      // Assert
      expect(record.resultText).toBe(text);
    });

    it("scrubs tool arguments, prompts, error messages and every log file", async () => {
      // Arrange
      const failure = { ...copilot.postToolUseFailure, toolArgs: JSON.stringify({ token: GITHUB_TOKEN }) };

      // Act
      await sandbox.recordOf("log-pre-tool.sh", CLAUDE, {
        ...claude.preToolUseSkill,
        tool_name: "Bash",
        tool_input: { command: `gh auth login --with-token ${GITHUB_TOKEN}` },
      });
      await sandbox.recordOf("log-prompt.sh", [], { ...copilot.userPromptSubmitted, prompt: `use ${GITHUB_TOKEN}` });
      await sandbox.recordOf("log-error.sh", [], {
        ...copilot.errorOccurred,
        error: { name: "E", message: `bad ${GITHUB_TOKEN}`, stack: `at ${GITHUB_TOKEN}` },
      });
      await sandbox.recordOf("log-post-tool.sh", [], {
        ...failure,
        toolResult: { resultType: "failure", textResultForLlm: `denied ${GITHUB_TOKEN}` },
      });

      // Assert
      expect(sandbox.audit().map((record) => record.event)).toEqual(["pre_tool", "prompt", "error", "post_tool"]);
      for (const file of ["audit.jsonl", "pre-tool.log", "tool-output.log", "ralph.log"]) {
        expect(sandbox.read(file), file).toContain("[REDACTED]");
        expect(sandbox.read(file), file).not.toContain(GITHUB_TOKEN);
      }
    });
  });

  describe("text round trip", () => {
    it("keeps quotes, backslashes, control characters and non-ASCII text intact", async () => {
      // Arrange
      const control = String.fromCharCode(1, 0x1f, 0x7f, 0x2028);
      const text = `"quoted" \\ C:\\path\ttab ${control} é 🚀 ${String.fromCharCode(0)}end`;

      // Act
      const record = await sandbox.recordOf("log-post-tool.sh", [], copilotResult(text));

      // Assert
      expect(record.resultText).toBe(text);
      expect(sandbox.read("tool-output.log")).toContain(`\n${text.replace(String.fromCharCode(0), "")}\n\n`);
    });
  });

  describe("audit text budget", () => {
    it("cuts audit result text at 2000 characters but keeps arguments whole", async () => {
      // Arrange
      const longArgs = JSON.stringify({ command: "x".repeat(5000) });

      // Act
      const record = await sandbox.recordOf("log-post-tool.sh", [], {
        ...copilotResult("é".repeat(2500)),
        toolArgs: longArgs,
      });

      // Assert
      expect(record.resultText).toBe(`${"é".repeat(2000)}...[truncated]`);
      expect(record.args).toBe(longArgs);
      expect(sandbox.read("tool-output.log")).toContain("é".repeat(2500));
    });

    it("cuts after scrubbing, so a secret across the cut leaves no prefix behind", async () => {
      // Arrange
      const token = "straddling-secret-value-0123456789";
      const text = `${"x".repeat(1995)}${token} tail`;

      // Act
      const record = await sandbox.recordOf("log-post-tool.sh", [], copilotResult(text), { CI_TOKEN: token });

      // Assert
      expect(record.resultText).toBe(`${"x".repeat(1995)}[REDA...[truncated]`);
    });

    it("cuts a subagent's last message the same way", async () => {
      // Arrange
      const payload = { ...claude.subagentStop, last_assistant_message: `${GITHUB_TOKEN} ${"y".repeat(2500)}` };

      // Act
      const record = await sandbox.recordOf("log-subagent.sh", CLAUDE, payload);

      // Assert
      expect(record.lastMessage).toBe(`[REDACTED] ${"y".repeat(1989)}...[truncated]`);
    });
  });

  describe("cost", () => {
    it("scrubs several thousand secrets in one tool result well under a second", async () => {
      // Arrange
      const envToken = "env-secret-value-0123456789";
      const lines = Array.from({ length: 2000 }, (_, index) =>
        [
          `ghp_${String(index).padStart(24, "a")}`,
          `X${index}_TOKEN=value${index}`,
          `"api_key":"k${index}"`,
          envToken,
        ].join(" "),
      );
      const payload = claudeBashResult(lines.join("\n"));

      // Act
      const started = performance.now();
      const record = await sandbox.recordOf("log-post-tool.sh", CLAUDE, payload, { CI_TOKEN: envToken });
      const elapsedMs = performance.now() - started;

      // Assert
      expect(elapsedMs).toBeLessThan(1000);
      expect(record.event).toBe("post_tool");
      const output = sandbox.read("tool-output.log");
      expect(output.match(/\[REDACTED\]/g)).toHaveLength(8000);
      expect(output).not.toMatch(/ghp_a|_TOKEN=value|"k\d|env-secret/);
    });
  });
});
