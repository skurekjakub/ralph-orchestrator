import { describe, it, expect } from "vitest";
import { parseResultBlock } from "../../src/container/result-parser.js";

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
});
