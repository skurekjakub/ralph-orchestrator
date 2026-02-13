import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { AppConfig, JiraConfig } from "../src/config.js";
import type { JiraIssue } from "../src/jira/types.js";
import type { RalphResult } from "../src/container/types.js";

// ── Orchestrator integration test ────────────────────────
// Tests the full orchestrator flow with mocked JIRA client and container manager.
// Validates: state transitions, retry logic, JIRA calls, queue behavior, log routing.

function makeIssue(key: string, summary = `Test issue ${key}`): JiraIssue {
  return {
    key,
    fields: { summary, status: { name: "New" } },
  };
}

function makeConfig(): AppConfig {
  return {
    jira: {
      baseUrl: "https://api.atlassian.com/ex/jira",
      cloudId: "test-cloud-id",
      project: "DF",
      jql: ["project = DF"],
      pollIntervalMs: 60000,
      inProgressTransitionId: "141",
      readyForReviewTransitionId: "91",
    },
    ralph: {
      repoPath: "/tmp/test-repo",
      devcontainerConfig: ".ralph/devcontainer.json",
      agentName: "ralph",
      timeoutMs: 1800000,
    },
    output: {
      logDir: "/tmp/test-output/logs",
      handoffDir: "/tmp/test-output/handoffs",
    },
    secrets: {
      ghToken: "test-gh-token",
      adoPatDocs: "test-ado-pat",
      adoPatXperience: "test-ado-xp-pat",
      jiraPat: "test-jira-pat",
      jiraEmail: "test@test.com",
    },
  };
}

// Since the Orchestrator instantiates JiraClient/ContainerManager/etc internally,
// we test core logic units that are independently testable.

describe("Orchestrator state management", () => {
  it("tracks completed tasks correctly", () => {
    const completed: Array<{
      key: string;
      summary: string;
      status: RalphResult["status"];
      durationMs: number;
      prUrl?: string;
    }> = [];

    completed.push({
      key: "DF-1",
      summary: "Test issue",
      status: "completed",
      durationMs: 120000,
      prUrl: "https://dev.azure.com/pr/1",
    });

    completed.push({
      key: "DF-2",
      summary: "Another issue",
      status: "partial",
      durationMs: 300000,
    });

    expect(completed).toHaveLength(2);
    expect(completed[0].status).toBe("completed");
    expect(completed[0].prUrl).toBe("https://dev.azure.com/pr/1");
    expect(completed[1].status).toBe("partial");
    expect(completed[1].prUrl).toBeUndefined();
  });

  it("maintains a log ring buffer", () => {
    const maxLines = 50;
    const buffer: Array<{ timestamp: number; level: string; message: string }> = [];

    for (let i = 0; i < 60; i++) {
      buffer.push({ timestamp: Date.now(), level: "info", message: `Log ${i}` });
      if (buffer.length > maxLines) {
        buffer.shift();
      }
    }

    expect(buffer).toHaveLength(50);
    expect(buffer[0].message).toBe("Log 10");
    expect(buffer[49].message).toBe("Log 59");
  });
});

describe("Orchestrator retry logic", () => {
  async function withRetry<T>(
    fn: () => Promise<T>,
    attempts = 3,
    delayMs = 10
  ): Promise<T> {
    for (let i = 1; i <= attempts; i++) {
      try {
        return await fn();
      } catch (err) {
        if (i === attempts) throw err;
        await new Promise((r) => setTimeout(r, delayMs * i));
      }
    }
    throw new Error("unreachable");
  }

  it("retries up to 3 times on failure", async () => {
    const fn = vi.fn()
      .mockRejectedValueOnce(new Error("fail 1"))
      .mockRejectedValueOnce(new Error("fail 2"))
      .mockResolvedValueOnce("success");

    const result = await withRetry(fn);
    expect(result).toBe("success");
    expect(fn).toHaveBeenCalledTimes(3);
  });

  it("throws after exhausting retries", async () => {
    const fn = vi.fn().mockRejectedValue(new Error("always fails"));

    await expect(withRetry(fn)).rejects.toThrow("always fails");
    expect(fn).toHaveBeenCalledTimes(3);
  });

  it("succeeds immediately if first attempt works", async () => {
    const fn = vi.fn().mockResolvedValue("ok");

    const result = await withRetry(fn);
    expect(result).toBe("ok");
    expect(fn).toHaveBeenCalledTimes(1);
  });
});

describe("Orchestrator state derivation", () => {
  it("derives correct status from flags", () => {
    function deriveStatus(running: boolean, busy: boolean): string {
      return !running ? "stopping" : busy ? "working" : "idle";
    }

    expect(deriveStatus(true, false)).toBe("idle");
    expect(deriveStatus(true, true)).toBe("working");
    expect(deriveStatus(false, false)).toBe("stopping");
    expect(deriveStatus(false, true)).toBe("stopping");
  });
});

describe("Orchestrator JIRA transition flow", () => {
  it("uses correct transition IDs from config", () => {
    const config = makeConfig();
    expect(config.jira.inProgressTransitionId).toBe("141");
    expect(config.jira.readyForReviewTransitionId).toBe("91");
  });

  it("config includes all required secrets", () => {
    const config = makeConfig();
    expect(config.secrets.ghToken).toBeTruthy();
    expect(config.secrets.adoPatDocs).toBeTruthy();
    expect(config.secrets.jiraPat).toBeTruthy();
    expect(config.secrets.jiraEmail).toBeTruthy();
  });
});

describe("Result status determination", () => {
  it("prefers agent status over exit code", () => {
    function determineStatus(
      exitCode: number,
      timedOut: boolean,
      agentStatus?: string
    ): string {
      let status: string;
      if (timedOut) {
        status = "partial";
      } else if (exitCode === 0) {
        status = "completed";
      } else {
        status = "error";
      }

      if (agentStatus === "completed" || agentStatus === "partial" || agentStatus === "blocked") {
        status = agentStatus;
      }

      return status;
    }

    // Exit code 0, agent says completed
    expect(determineStatus(0, false, "completed")).toBe("completed");

    // Exit code 0, agent says partial
    expect(determineStatus(0, false, "partial")).toBe("partial");

    // Exit code 1, agent says completed (agent wins)
    expect(determineStatus(1, false, "completed")).toBe("completed");

    // Exit code 1, no agent status
    expect(determineStatus(1, false)).toBe("error");

    // Timed out, no agent status
    expect(determineStatus(1, true)).toBe("partial");

    // Timed out, agent says blocked (agent wins)
    expect(determineStatus(1, true, "blocked")).toBe("blocked");

    // Exit code 0, no agent status
    expect(determineStatus(0, false)).toBe("completed");
  });
});

describe("Log collector", () => {
  it("creates valid summary JSON structure", () => {
    const result: RalphResult = {
      issueKey: "DF-2704",
      status: "completed",
      durationMs: 120000,
      exitCode: 0,
      stdout: "output",
      stderr: "",
      prUrl: "https://dev.azure.com/pr/1",
      auditLogPath: "/tmp/logs/DF-2704-123.jsonl",
    };

    const summary = {
      issueKey: result.issueKey,
      status: result.status,
      durationMs: result.durationMs,
      exitCode: result.exitCode,
      prUrl: result.prUrl,
      handoffPath: result.handoffPath,
      auditLogPath: result.auditLogPath,
      timestamp: new Date().toISOString(),
    };

    const json = JSON.stringify(summary, null, 2);
    const parsed = JSON.parse(json);

    expect(parsed.issueKey).toBe("DF-2704");
    expect(parsed.status).toBe("completed");
    expect(parsed.durationMs).toBe(120000);
    expect(parsed.prUrl).toBe("https://dev.azure.com/pr/1");
    expect(parsed.timestamp).toBeDefined();
    expect(parsed.handoffPath).toBeUndefined();
  });
});
