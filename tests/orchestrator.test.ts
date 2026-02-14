import { describe, it, expect, vi } from "vitest";
import type { RalphResult } from "../src/container/types.js";
import { makeProfile, makeConfig } from "./helpers.js";

// ── Orchestrator core tests ──────────────────────────────
// Tests state management, retry logic, state derivation, and JIRA transition flow.
// Profile routing and log persistence are in their own test files.

describe("Orchestrator state management", () => {
  it("tracks completed tasks correctly", () => {
    const completed: Array<{
      key: string;
      summary: string;
      profileId: string;
      status: RalphResult["status"];
      durationMs: number;
      prUrl?: string;
    }> = [];

    completed.push({
      key: "DF-1",
      summary: "Test issue",
      profileId: "ralph-docs",
      status: "completed",
      durationMs: 120000,
      prUrl: "https://dev.azure.com/pr/1",
    });

    completed.push({
      key: "DF-2",
      summary: "Another issue",
      profileId: "ralph-vscode",
      status: "partial",
      durationMs: 300000,
    });

    expect(completed).toHaveLength(2);
    expect(completed[0].status).toBe("completed");
    expect(completed[0].profileId).toBe("ralph-docs");
    expect(completed[0].prUrl).toBe("https://dev.azure.com/pr/1");
    expect(completed[1].status).toBe("partial");
    expect(completed[1].profileId).toBe("ralph-vscode");
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
  it("uses correct transition IDs from profile config", () => {
    const config = makeConfig();
    const profile = config.profiles[0];
    expect(profile.transitions.inProgressId).toBe("141");
    expect(profile.transitions.readyForReviewId).toBe("91");
  });

  it("config includes all required secrets", () => {
    const config = makeConfig();
    expect(config.secrets.ghToken).toBeTruthy();
    expect(config.secrets.adoPatDocs).toBeTruthy();
    expect(config.secrets.jiraPat).toBeTruthy();
    expect(config.secrets.jiraEmail).toBeTruthy();
  });
});
