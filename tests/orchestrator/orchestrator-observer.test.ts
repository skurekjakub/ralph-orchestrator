import { describe, it, expect, vi } from "vitest";
import { OrchestratorObserver } from "../../src/orchestrator-observer.js";
import type { ObservableContext } from "../../src/orchestrator-observer.js";
import type { LogEntry } from "../../src/orchestrator-types.js";
import { OrchestratorStatus, LogLevel, LogSource } from "../../src/orchestrator-types.js";
import { HeartbeatStatus } from "../../src/services/heartbeat.js";
import { makeIssue, makeProfile, makeCompletion } from "../helpers/factories.js";

function makeContext(overrides: Partial<ObservableContext> = {}): ObservableContext {
  return {
    activeTask: null,
    running: true,
    pendingOps: [],
    logEntries: [],
    profileIds: ["ralph-docs"],
    ...overrides,
  };
}

const fakeIssue = makeIssue("DOC-100", "Test issue");

const fakeProfile = makeProfile({ id: "ralph-docs", agentName: "ralph" });

function makeActiveTask(startedAt = 1000) {
  return { issue: fakeIssue, profile: fakeProfile, container: null, startedAt };
}

describe("OrchestratorObserver", () => {
  describe("getState()", () => {
    it("returns idle when running with no active task", () => {
      const observer = new OrchestratorObserver(() => makeContext());
      const state = observer.getState();
      expect(state.status).toBe(OrchestratorStatus.Idle);
      expect(state.currentIssue).toBeNull();
      expect(state.currentProfile).toBeNull();
      expect(state.startedAt).toBeNull();
    });

    it("returns working when an active task exists", () => {
      const task = makeActiveTask(42000);
      const observer = new OrchestratorObserver(() =>
        makeContext({ activeTask: task })
      );
      const state = observer.getState();
      expect(state.status).toBe(OrchestratorStatus.Working);
      expect(state.currentIssue).toEqual({ key: "DOC-100", summary: "Test issue" });
      expect(state.currentProfile).toBe("ralph-docs:ralph:@ralph");
      expect(state.startedAt).toBe(42000);
    });

    it("returns stopping when not running", () => {
      const observer = new OrchestratorObserver(() =>
        makeContext({ running: false })
      );
      expect(observer.getState().status).toBe(OrchestratorStatus.Stopping);
    });

    it("maps pending ops to queue items", () => {
      const observer = new OrchestratorObserver(() =>
        makeContext({
          pendingOps: [
            { issueKey: "DOC-1", variant: "tech-writer" },
            { issueKey: "DOC-2", variant: "reviewer" },
          ],
        })
      );
      const state = observer.getState();
      expect(state.queueSize).toBe(2);
      expect(state.queueItems).toEqual([
        { key: "DOC-1", summary: "tech-writer" },
        { key: "DOC-2", summary: "reviewer" },
      ]);
    });

    it("separates orchestrator and container logs", () => {
      const logs: LogEntry[] = [
        { timestamp: 1, level: LogLevel.Info, message: "Started", source: LogSource.Orchestrator },
        { timestamp: 2, level: LogLevel.Info, message: "Building...", source: LogSource.Container },
        { timestamp: 3, level: LogLevel.Warn, message: "Slow", source: LogSource.Orchestrator },
      ];
      const observer = new OrchestratorObserver(() =>
        makeContext({ logEntries: logs })
      );
      const state = observer.getState();
      expect(state.logs).toHaveLength(3);
      expect(state.orchestratorLogs).toHaveLength(2);
      expect(state.containerLogs).toHaveLength(1);
    });

    it("includes profileIds from context", () => {
      const observer = new OrchestratorObserver(() =>
        makeContext({ profileIds: ["ralph-docs", "ralph-vscode"] })
      );
      expect(observer.getState().profileIds).toEqual(["ralph-docs", "ralph-vscode"]);
    });

    it("includes recorded completions", () => {
      const observer = new OrchestratorObserver(() => makeContext());
      observer.recordCompletion(makeCompletion("DOC-1"));
      observer.recordCompletion(makeCompletion("DOC-2"));
      const state = observer.getState();
      expect(state.completedToday).toHaveLength(2);
      expect(state.completedToday[0].key).toBe("DOC-1");
    });

    it("returns a copy of completedToday (not a live reference)", () => {
      const observer = new OrchestratorObserver(() => makeContext());
      observer.recordCompletion(makeCompletion("DOC-100"));
      const snapshot1 = observer.getState().completedToday;
      observer.recordCompletion(makeCompletion("DOC-2"));
      const snapshot2 = observer.getState().completedToday;
      expect(snapshot1).toHaveLength(1);
      expect(snapshot2).toHaveLength(2);
    });
  });

  describe("emit()", () => {
    it("calls registered callback with current state", () => {
      const observer = new OrchestratorObserver(() => makeContext());
      const callback = vi.fn();
      observer.onStateChange(callback);
      observer.emit();
      expect(callback).toHaveBeenCalledOnce();
      expect(callback.mock.calls[0][0].status).toBe(OrchestratorStatus.Idle);
    });

    it("does nothing when no callback is registered", () => {
      const observer = new OrchestratorObserver(() => makeContext());
      expect(() => observer.emit()).not.toThrow();
    });

    it("guards against reentrancy from callbacks", () => {
      const observer = new OrchestratorObserver(() => makeContext());
      const calls: string[] = [];
      observer.onStateChange(() => {
        calls.push("outer-start");
        observer.emit(); // reentrant call — should be skipped
        calls.push("outer-end");
      });
      observer.emit();
      expect(calls).toEqual(["outer-start", "outer-end"]);
    });
  });

  describe("getHeartbeatPayload()", () => {
    it("returns polling status when idle", () => {
      const observer = new OrchestratorObserver(() => makeContext());
      const payload = observer.getHeartbeatPayload();
      expect(payload.status).toBe(HeartbeatStatus.Polling);
      expect(payload.currentTask).toBeNull();
      expect(payload.profileId).toBeNull();
      expect(payload.queueSize).toBe(0);
      expect(payload.totalProcessed).toBe(0);
      expect(payload.agentId).toBe(observer.agentId);
    });

    it("returns working status with active task details", () => {
      const task = makeActiveTask(1700000000000);
      const observer = new OrchestratorObserver(() =>
        makeContext({ activeTask: task })
      );
      const payload = observer.getHeartbeatPayload();
      expect(payload.status).toBe(HeartbeatStatus.Working);
      expect(payload.currentTask).toBe("DOC-100");
      expect(payload.profileId).toBe("ralph-docs");
      expect(payload.currentTaskStartedAt).toBe(new Date(1700000000000).toISOString());
    });

    it("returns stopped when not running", () => {
      const observer = new OrchestratorObserver(() =>
        makeContext({ running: false })
      );
      expect(observer.getHeartbeatPayload().status).toBe(HeartbeatStatus.Stopped);
    });

    it("includes completion stats", () => {
      const observer = new OrchestratorObserver(() => makeContext());
      observer.recordCompletion(makeCompletion("DOC-1"));
      observer.recordCompletion(makeCompletion("DOC-2"));
      const payload = observer.getHeartbeatPayload();
      expect(payload.totalProcessed).toBe(2);
      expect(payload.lastCompletedTask).toBe("DOC-2");
      expect(payload.lastCompletedAt).toBeTruthy();
    });

    it("includes queue size from pending ops", () => {
      const observer = new OrchestratorObserver(() =>
        makeContext({
          pendingOps: [
            { issueKey: "DOC-1", variant: "v1" },
            { issueKey: "DOC-2", variant: "v2" },
            { issueKey: "DOC-3", variant: "v3" },
          ],
        })
      );
      expect(observer.getHeartbeatPayload().queueSize).toBe(3);
    });

    it("generates a stable agentId per instance", () => {
      const observer = new OrchestratorObserver(() => makeContext());
      expect(observer.agentId).toBe(observer.agentId);
      expect(observer.agentId).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/
      );
    });

    it("generates different agentIds across instances", () => {
      const a = new OrchestratorObserver(() => makeContext());
      const b = new OrchestratorObserver(() => makeContext());
      expect(a.agentId).not.toBe(b.agentId);
    });
  });
});
