import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { join } from "node:path";
import { HookRulesRedactor } from "../../src/logs/text-redactor";
import { HOOKS_DIR, HookSandbox, loadPayloads } from "../hooks/hook-harness";

const SCRIPT = join(HOOKS_DIR, "lib", "redact.pl");
const PATH = process.env.PATH ?? "/usr/bin:/bin";
const GITHUB_TOKEN = "ghp_0123456789abcdefghijABCDEFGHIJ";
const ENV_SECRET = "oauth-value-0123456789";

/** Texts the audit hooks scrub, one per redaction rule, and a text with nothing to scrub. */
const CASES: readonly [string, string][] = [
  ["a credential variable's value", `CLAUDE_CODE_OAUTH_TOKEN=${ENV_SECRET}\nX=${ENV_SECRET}`],
  ["an Anthropic key", "key sk-ant-api03-AbCdEf0123456789_xyz end"],
  ["a GitHub token after a newline", `first line\n${GITHUB_TOKEN}`],
  ["a fine-grained GitHub PAT", "github_pat_11ABCDEFG0123456789_abcdefghijklmnop"],
  ["an Authorization header", "curl -H 'Authorization: Bearer abc.def.ghi' x"],
  ["a git extraheader", "http.extraheader=AUTHORIZATION: basic dXNlcjpwYXQ="],
  ["a URL password", "git clone https://ralph:s3cr3tvalue@dev.azure.com/org"],
  ["an env assignment", "export ADO_PAT=abcdefgh12345 && run"],
  ["a JSON credential field", '{"api_key": "abcdefghijk", "name": "x"}'],
  ["an escaped JSON credential field", '{\\"client_secret\\":\\"abcdefghijk\\"}'],
  ["variable references and token counts", 'echo GH_TOKEN=$GH_TOKEN; {"input_tokens": 123456789}'],
];

describe("HookRulesRedactor", () => {
  const redactor = new HookRulesRedactor({ scriptPath: SCRIPT, env: { PATH, CLAUDE_CODE_OAUTH_TOKEN: ENV_SECRET } });

  describe("equivalence with the audit hooks", () => {
    let sandbox: HookSandbox;
    const copilot = loadPayloads("copilot");

    beforeEach(() => {
      sandbox = new HookSandbox();
    });

    afterEach(() => {
      sandbox.cleanup();
    });

    it.each(CASES)("scrubs %s exactly as the hooks scrub a tool result", async (_label, text) => {
      // Arrange
      const payload = { ...copilot.postToolUseBash, toolResult: { resultType: "success", textResultForLlm: text } };
      const record = await sandbox.recordOf("log-post-tool.sh", [], payload, { CLAUDE_CODE_OAUTH_TOKEN: ENV_SECRET });

      // Act
      const redacted = await redactor.redact(text);

      // Assert
      expect(redacted).toBe(record.resultText);
    });
  });

  describe("text handling", () => {
    it("keeps text with nothing to scrub byte for byte, trailing newline and non-ASCII included", async () => {
      // Arrange
      const text = `# Transcript\n\n"quoted" \\ C:\\path\ttab é 🚀 ${String.fromCharCode(0)}end\n`;

      // Act & Assert
      expect(await redactor.redact(text)).toBe(text);
    });

    it("scrubs every occurrence in a long text without cutting it", async () => {
      // Arrange
      const text = `${"x".repeat(5000)} ${GITHUB_TOKEN}\n`.repeat(3);

      // Act
      const redacted = await redactor.redact(text);

      // Assert
      expect(redacted).toBe(`${"x".repeat(5000)} [REDACTED]\n`.repeat(3));
    });

    it("scrubs the credential values of the environment it is given", async () => {
      // Arrange
      const scoped = new HookRulesRedactor({
        scriptPath: SCRIPT,
        env: { PATH, DASHBOARD_SECRET: "dashboard-secret-42" },
      });

      // Act & Assert
      expect(await scoped.redact("posting with dashboard-secret-42")).toBe("posting with [REDACTED]");
    });
  });

  describe("each text of a batch", () => {
    it("scrubs each text on its own, exactly as it scrubs one text", async () => {
      // Arrange
      const texts = CASES.map(([, text]) => text);

      // Act
      const redacted = await redactor.redactEach(texts);

      // Assert
      expect(redacted).toEqual(await Promise.all(texts.map((text) => redactor.redact(text))));
    });

    it("keeps each text whole and apart: newlines, quotes, NUL, non-ASCII and empty texts", async () => {
      // Arrange
      const texts = [`line\n"quoted" \\ tab\t é 🚀 ${String.fromCharCode(0)}end\n`, "", "\n\n"];

      // Act & Assert
      expect(await redactor.redactEach(texts)).toEqual(texts);
    });

    it("does not let a secret pattern run from one text into the next", async () => {
      // Arrange
      const texts = ['{"token": "', 'next text"}'];

      // Act & Assert
      expect(await redactor.redactEach(texts)).toEqual(texts);
    });

    it("returns no texts for an empty batch without running the script", async () => {
      // Arrange
      const missing = new HookRulesRedactor({ scriptPath: "/nonexistent/redact.pl", env: { PATH } });

      // Act & Assert
      await expect(missing.redactEach([])).resolves.toEqual([]);
    });
  });

  describe("failures", () => {
    it("throws, without quoting the text, when the script is missing", async () => {
      // Arrange
      const missing = new HookRulesRedactor({ scriptPath: "/nonexistent/redact.pl", env: { PATH } });

      // Act
      const failure = missing.redact(`secret ${GITHUB_TOKEN}`);

      // Assert
      await expect(failure).rejects.toThrow("Redacting with /nonexistent/redact.pl failed");
      await expect(failure).rejects.not.toThrow(GITHUB_TOKEN);
    });

    it("throws, without quoting the texts, when a batch cannot be redacted", async () => {
      // Arrange
      const missing = new HookRulesRedactor({ scriptPath: "/nonexistent/redact.pl", env: { PATH } });

      // Act
      const failure = missing.redactEach([`secret ${GITHUB_TOKEN}`]);

      // Assert
      await expect(failure).rejects.toThrow("Redacting with /nonexistent/redact.pl failed");
      await expect(failure).rejects.not.toThrow(GITHUB_TOKEN);
    });

    it("throws when perl cannot be found", async () => {
      // Arrange
      const noPerl = new HookRulesRedactor({ scriptPath: SCRIPT, env: { PATH: "/nonexistent" } });

      // Act & Assert
      await expect(noPerl.redact("text")).rejects.toThrow(/Redacting with .* failed/);
    });
  });
});
