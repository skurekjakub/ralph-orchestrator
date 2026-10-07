import { describe, it, expect } from "vitest";
import { hasResultBlock, parseResultBlock, resolveStatus, type StatusInput } from "../../src/container/result-parser";
import { FailureReason, TaskStatus } from "../../src/container/types";
import { createMockLogger } from "../helpers/mocks";

// ── Result parsing tests ─────────────────────────────────
// Tests the structured result block parser that extracts PR URL and agent status
// from CLI stdout.

describe("Result parsing", () => {
  it("extracts PR URL and status from structured block", () => {
    const stdout = `
Some other output...
===RALPH_RESULT_START===
JIRA_KEY: DF-2704
STATUS: completed
BRANCH: ralph/df-2704-custom-modules
PR_URL: https://dev.azure.com/org/project/_git/repo/pullrequest/123
HANDOFF: resources/chats/DF-2704/handoff.md
SUMMARY: Added custom module documentation
===RALPH_RESULT_END===
`;

    const { prUrl, agentStatus } = parseResultBlock(stdout);
    expect(prUrl).toBe("https://dev.azure.com/org/project/_git/repo/pullrequest/123");
    expect(agentStatus).toBe("completed");
  });

  it("handles 'none' PR URL", () => {
    const stdout = `
===RALPH_RESULT_START===
STATUS: partial
PR_URL: none
===RALPH_RESULT_END===
`;

    const { prUrl, agentStatus } = parseResultBlock(stdout);
    expect(prUrl).toBeUndefined();
    expect(agentStatus).toBe("partial");
  });

  it("falls back to loose PR URL regex when no structured block", () => {
    const stdout = "Pull Request: https://dev.azure.com/pr/456";

    const { prUrl, agentStatus } = parseResultBlock(stdout);
    expect(prUrl).toBe("https://dev.azure.com/pr/456");
    expect(agentStatus).toBeUndefined();
  });

  it("returns undefined for both when no matches", () => {
    const { prUrl, agentStatus } = parseResultBlock("random output");
    expect(prUrl).toBeUndefined();
    expect(agentStatus).toBeUndefined();
  });

  it("handles blocked status", () => {
    const stdout = `
===RALPH_RESULT_START===
STATUS: blocked
PR_URL: none
SUMMARY: Git conflict on master
===RALPH_RESULT_END===
`;

    const { agentStatus } = parseResultBlock(stdout);
    expect(agentStatus).toBe("blocked");
  });

  it("handles lowercase field names from agent templates", () => {
    const stdout = `
===RALPH_RESULT_START===
status: completed
pr_url: https://dev.azure.com/org/project/_git/repo/pullrequest/789
summary: Implemented feature
===RALPH_RESULT_END===
`;

    const { prUrl, agentStatus } = parseResultBlock(stdout);
    expect(prUrl).toBe("https://dev.azure.com/org/project/_git/repo/pullrequest/789");
    expect(agentStatus).toBe("completed");
  });
});

describe("hasResultBlock", () => {
  it.each(["completed", "partial", "blocked"])("accepts a block whose status is %s", (status) => {
    // Act & Assert
    expect(hasResultBlock(`text\n===RALPH_RESULT_START===\nSTATUS: ${status}\n===RALPH_RESULT_END===`)).toBe(true);
  });

  it.each([
    ["an unknown status", "===RALPH_RESULT_START===\nSTATUS: success\n===RALPH_RESULT_END==="],
    ["no status", "===RALPH_RESULT_START===\nPR_URL: none\n===RALPH_RESULT_END==="],
    ["no end marker", "===RALPH_RESULT_START===\nSTATUS: completed"],
    ["no block at all", "Pull Request: https://dev.azure.com/pr/1"],
  ])("rejects %s", (_case, text) => {
    // Act & Assert
    expect(hasResultBlock(text)).toBe(false);
  });
});

describe("resolveStatus", () => {
  /** A clean exit with no result block, in a stage that requires none, overridden per case. */
  const input = (overrides: Partial<StatusInput>): StatusInput => ({
    exitCode: 0,
    timedOut: false,
    agentStatus: undefined,
    requireResultBlock: false,
    ...overrides,
  });

  describe("priority", () => {
    it.each<[string, Partial<StatusInput>, TaskStatus, FailureReason | undefined]>([
      [
        "the agent's status over a timeout, a CLI error and a non-zero exit",
        {
          agentStatus: "blocked",
          timedOut: true,
          exitCode: 1,
          cliError: { subtype: "error_max_turns" },
          requireResultBlock: true,
        },
        TaskStatus.Blocked,
        undefined,
      ],
      [
        "a timeout over a CLI error",
        { timedOut: true, cliError: { subtype: "authentication_failed" }, requireResultBlock: true },
        TaskStatus.Partial,
        undefined,
      ],
      [
        "a CLI error over a non-zero exit",
        { exitCode: 1, cliError: { subtype: "error_during_execution" }, requireResultBlock: true },
        TaskStatus.Error,
        FailureReason.ExecutionError,
      ],
      [
        "a non-zero exit over a missing result block",
        { exitCode: 137, requireResultBlock: true },
        TaskStatus.Error,
        FailureReason.ExitCode,
      ],
      [
        "a missing required result block",
        { requireResultBlock: true },
        TaskStatus.Error,
        FailureReason.MissingResultBlock,
      ],
      ["a clean exit when no result block is required", {}, TaskStatus.Completed, undefined],
    ])("resolves %s", (_label, overrides, status, failureReason) => {
      // Act
      const resolved = resolveStatus(input(overrides));

      // Assert
      expect(resolved).toEqual(failureReason === undefined ? { status } : { status, failureReason });
    });
  });

  describe("CLI errors", () => {
    it.each([
      ["authentication_failed", FailureReason.AuthFailed],
      ["error_max_turns", FailureReason.MaxTurns],
      ["error_during_execution", FailureReason.ExecutionError],
      ["rate_limit", FailureReason.CliError],
      ["server_error", FailureReason.CliError],
    ])("maps subtype %s to %s", (subtype, failureReason) => {
      // Act & Assert
      expect(resolveStatus(input({ cliError: { subtype } }))).toEqual({ status: TaskStatus.Error, failureReason });
    });
  });

  describe("agent status", () => {
    it.each(["completed", "partial", "blocked"])("takes a reported %s", (agentStatus) => {
      // Act & Assert
      expect(resolveStatus(input({ agentStatus, exitCode: 1 }))).toEqual({ status: agentStatus });
    });

    it("warns about an unrecognized status and treats the block as missing", () => {
      // Arrange
      const logger = createMockLogger();

      // Act
      const resolved = resolveStatus(input({ agentStatus: "success", requireResultBlock: true }), logger);

      // Assert
      expect(resolved).toEqual({ status: TaskStatus.Error, failureReason: FailureReason.MissingResultBlock });
      expect(logger.warn).toHaveBeenCalledWith(expect.stringContaining('unrecognized status "success"'));
    });

    it("completes on exit 0 with an unrecognized status when no result block is required", () => {
      // Act & Assert
      expect(resolveStatus(input({ agentStatus: "success" }))).toEqual({ status: TaskStatus.Completed });
    });
  });
});
