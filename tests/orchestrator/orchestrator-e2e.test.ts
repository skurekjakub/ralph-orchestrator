import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

import { Orchestrator } from "../../src/orchestrator";
import { OperationStatus } from "../../src/services/operation-ledger";
import { makeProfile, makeWorkItemComment, makeWorkItem, makeResult } from "../helpers/factories";
import { OrchestratorStatus, TransitionPhase } from "../../src/orchestrator-types";
import type { IAgentProfile } from "../../src/config/types";
import { FailureReason, TaskStatus } from "../../src/container/types";
import { HeartbeatStatus } from "../../src/services/heartbeat";
import { buildMockDeps, buildBaseDeps, runUntil, DS } from "./e2e-helpers";
import { createMockVcsSourceClient } from "../helpers/mocks";

const PROJECT = "DF";
const TS = "2026-01-01T00:00:00Z";
const KEY = "DF-100";
const CID = "C1";

/**
 * E2E orchestrator loop tests with mock dependencies.
 *
 * The orchestrator loop is event-driven: the poller and ledger signal
 * via callbacks when new work arrives. No fake timers needed.
 */

let tempDir: string;

beforeEach(() => {
  tempDir = mkdtempSync(join(tmpdir(), "e2e-orchestrator-"));
});

afterEach(() => {
  rmSync(tempDir, { recursive: true, force: true });
});

describe("Orchestrator E2E loop (mock deps)", () => {
  it("completes full cycle: poll -> trigger scan -> execute -> completion", async () => {
    const issue = makeWorkItem(KEY, "Update API docs", "New");
    const deps = buildMockDeps(tempDir, {
      issues: [issue],
      comments: {
        [KEY]: [makeWorkItemComment(CID, "@docs please handle this")],
      },
    });

    const orchestrator = new Orchestrator(deps);

    await runUntil(orchestrator, () => orchestrator.observer.getState().completedToday.length > 0);

    expect(deps.pollers.get(DS)!.start).toHaveBeenCalled();
    expect(deps.pollers.get(DS)!.stop).toHaveBeenCalled();
    expect(deps.issueManager.postAckComment).toHaveBeenCalled();
    expect(deps.taskRunner.run).toHaveBeenCalledWith(
      expect.objectContaining({
        workItem: expect.objectContaining({ id: KEY }),
        profile: expect.objectContaining({ id: "ralph-docs" }),
        taskId: expect.stringMatching(/^DF-100-\d+$/),
      }),
    );
    expect(deps.issueManager.transitionWorkItem).toHaveBeenCalledWith(DS, KEY, undefined, TransitionPhase.AfterAgent);

    const state = orchestrator.observer.getState();
    expect(state.completedToday).toHaveLength(1);
    expect(state.completedToday[0].key).toBe(KEY);
    expect(state.completedToday[0].status).toBe(TaskStatus.Completed);

    const ops = deps.ledger.getOperations(DS, KEY);
    expect(ops).toHaveLength(1);
    expect(ops[0].status).toBe(OperationStatus.Completed);
  });

  it("posts error comment when agent returns error status without throwing", async () => {
    const issue = makeWorkItem("DF-150", "Agent CLI fails");
    const deps = buildMockDeps(tempDir, {
      issues: [issue],
      comments: {
        "DF-150": [makeWorkItemComment(CID, "@docs handle this")],
      },
      taskResult: {
        status: TaskStatus.Error,
        exitCode: 1,
        stderr: "No such agent: ralph",
      },
    });

    const orchestrator = new Orchestrator(deps);

    await runUntil(orchestrator, () => orchestrator.observer.getState().completedToday.length > 0);

    expect(deps.issueManager.postErrorComment).toHaveBeenCalledWith(DS, "DF-150", "No such agent: ralph");
    expect(deps.issueManager.transitionWorkItem).not.toHaveBeenCalledWith(
      expect.anything(),
      expect.anything(),
      expect.anything(),
      TransitionPhase.AfterAgent,
    );

    const ops = deps.ledger.getOperations(DS, "DF-150");
    expect(ops[0].status).toBe(OperationStatus.Error);
    expect(ops[0].resultStatus).toBe(TaskStatus.Error);
  });

  it.each([
    [
      "ended without its result block",
      { failureReason: FailureReason.MissingResultBlock, exitCode: 0 },
      "The agent finished without the ===RALPH_RESULT_START=== … ===RALPH_RESULT_END=== result block its stage requires",
    ],
    [
      "could not authenticate",
      {
        failureReason: FailureReason.AuthFailed,
        exitCode: 1,
        cliError: { subtype: "authentication_failed", message: "Not logged in · Please run /login" },
      },
      "The agent CLI could not authenticate: Not logged in · Please run /login",
    ],
  ])("records and comments the failure reason when the agent %s", async (_label, failure, reason) => {
    // Arrange
    const issue = makeWorkItem("DF-153", "Agent breaks the contract");
    const deps = buildMockDeps(tempDir, {
      issues: [issue],
      comments: { "DF-153": [makeWorkItemComment(CID, "@docs handle this")] },
      taskResult: { status: TaskStatus.Error, stderr: "", ...failure },
    });
    const orchestrator = new Orchestrator(deps);

    // Act
    await runUntil(orchestrator, () => orchestrator.observer.getState().completedToday.length > 0);

    // Assert
    expect(deps.issueManager.postErrorComment).toHaveBeenCalledWith(DS, "DF-153", reason);
    expect(deps.ledger.getOperations(DS, "DF-153")[0]).toMatchObject({ status: OperationStatus.Error, reason });
    expect(deps.issueManager.transitionWorkItem).not.toHaveBeenCalledWith(
      expect.anything(),
      expect.anything(),
      expect.anything(),
      TransitionPhase.AfterAgent,
    );
  });

  it("maps TaskStatus.Blocked to OperationStatus.Error in the ledger", async () => {
    const issue = makeWorkItem("DF-151", "Agent blocked by missing context");
    const deps = buildMockDeps(tempDir, {
      issues: [issue],
      comments: {
        "DF-151": [makeWorkItemComment(CID, "@docs handle this")],
      },
      taskResult: {
        status: TaskStatus.Blocked,
        exitCode: 1,
        stderr: "Missing required context",
      },
    });

    const orchestrator = new Orchestrator(deps);

    await runUntil(orchestrator, () => orchestrator.observer.getState().completedToday.length > 0);

    const ops = deps.ledger.getOperations(DS, "DF-151");
    expect(ops[0].status).toBe(OperationStatus.Error);
    expect(ops[0].resultStatus).toBe(TaskStatus.Blocked);
    expect(deps.issueManager.postErrorComment).toHaveBeenCalledWith(DS, "DF-151", "Missing required context");
    expect(deps.issueManager.transitionWorkItem).not.toHaveBeenCalledWith(
      expect.anything(),
      expect.anything(),
      expect.anything(),
      TransitionPhase.AfterAgent,
    );
  });

  it("maps TaskStatus.Partial to OperationStatus.Completed in the ledger", async () => {
    const issue = makeWorkItem("DF-152", "Agent partial success");
    const deps = buildMockDeps(tempDir, {
      issues: [issue],
      comments: {
        "DF-152": [makeWorkItemComment(CID, "@docs handle this")],
      },
      taskResult: {
        status: TaskStatus.Partial,
        exitCode: 0,
        stderr: "",
      },
    });

    const orchestrator = new Orchestrator(deps);

    await runUntil(orchestrator, () => orchestrator.observer.getState().completedToday.length > 0);

    const ops = deps.ledger.getOperations(DS, "DF-152");
    expect(ops[0].status).toBe(OperationStatus.Completed);
    expect(ops[0].resultStatus).toBe(TaskStatus.Partial);
    expect(deps.issueManager.transitionWorkItem).toHaveBeenCalledWith(
      DS,
      "DF-152",
      undefined,
      TransitionPhase.AfterAgent,
    );
    expect(deps.issueManager.postErrorComment).not.toHaveBeenCalled();
  });

  it("handles task runner errors gracefully", async () => {
    const issue = makeWorkItem("DF-200", "Broken task");
    const deps = buildMockDeps(tempDir, {
      issues: [issue],
      comments: {
        "DF-200": [makeWorkItemComment(CID, "@docs handle this")],
      },
      taskError: new Error("Container build failed"),
    });

    const orchestrator = new Orchestrator(deps);

    await runUntil(orchestrator, () => orchestrator.observer.getState().completedToday.length > 0);

    const state = orchestrator.observer.getState();
    expect(state.completedToday).toHaveLength(1);
    expect(state.completedToday[0].status).toBe(TaskStatus.Error);
    expect(deps.issueManager.postErrorComment).toHaveBeenCalledWith(DS, "DF-200", "Container build failed");

    const ops = deps.ledger.getOperations(DS, "DF-200");
    expect(ops[0].status).toBe(OperationStatus.Error);
    expect(deps.issueManager.transitionWorkItem).not.toHaveBeenCalledWith(
      expect.anything(),
      expect.anything(),
      expect.anything(),
      TransitionPhase.AfterAgent,
    );
  });

  it("passes inferred PR branches to the task runner for revision tasks", async () => {
    const profile = makeProfile({
      id: "ralph-docs",
      agentName: "ralph",
      preflight: "revision-ready",
      match: {
        projects: [PROJECT],
        statuses: ["Defect Found"],
        commentTrigger: "@docs",
        revisionStatuses: ["Defect Found"],
      },
    });
    const issue = makeWorkItem("DF-175", "Revision task", "Defect Found");
    const vcsSourceClient = createMockVcsSourceClient({
      resolvePullRequestBranches: vi.fn().mockResolvedValue({
        sourceBranch: "feature/revision-fix",
        targetBranch: "release/31",
      }),
    });
    const deps = buildMockDeps(tempDir, {
      profile,
      issues: [issue],
      comments: {
        "DF-175": [
          makeWorkItemComment(CID, "@docs handle revision https://dev.azure.com/org/project/_git/repo/pullrequest/42"),
        ],
      },
      resources: {
        fetchHandoff: vi.fn().mockResolvedValue("## Previous handoff"),
      },
      vcsSourceClient,
    });

    const orchestrator = new Orchestrator(deps);

    await runUntil(orchestrator, () => orchestrator.observer.getState().completedToday.length > 0);

    expect(deps.taskRunner.run).toHaveBeenCalledWith(
      expect.objectContaining({
        sourceBranch: "release/31",
        taskBranch: "feature/revision-fix",
        prUrl: "https://dev.azure.com/org/project/_git/repo/pullrequest/42",
      }),
    );
  });

  it("rejects operation when issue status changed since planning", async () => {
    const profile = makeProfile({
      id: "ralph-docs",
      agentName: "ralph",
      match: {
        projects: [PROJECT],
        statuses: ["New"],
        commentTrigger: "@docs",
        revisionStatuses: [],
      },
    });
    const issueAtPoll = makeWorkItem("DF-300", "Task that moved", "New");
    const issueAtExec = makeWorkItem("DF-300", "Task that moved", "Done");

    const deps = buildMockDeps(tempDir, {
      profile,
      issues: [issueAtPoll],
      comments: {
        "DF-300": [makeWorkItemComment(CID, "@docs go")],
      },
      searchResults: {
        "DF-300": [issueAtExec],
      },
    });

    const orchestrator = new Orchestrator(deps);

    await runUntil(orchestrator, () => {
      const ops = deps.ledger.getOperations(DS, "DF-300");
      return ops.length > 0 && ops[0].status === OperationStatus.Rejected;
    });

    const ops = deps.ledger.getOperations(DS, "DF-300");
    expect(ops[0].status).toBe(OperationStatus.Rejected);
    expect(deps.taskRunner.run).not.toHaveBeenCalled();
  });

  it("skips issues that match no profile", async () => {
    const issue = makeWorkItem("OTHER-1", "Wrong project");
    const deps = buildMockDeps(tempDir, {
      issues: [issue],
      comments: {
        "OTHER-1": [makeWorkItemComment(CID, "@docs go")],
      },
    });

    const orchestrator = new Orchestrator(deps);

    // No matching profile -> nothing planned -> loop waits for signal -> timeout stops it
    await runUntil(orchestrator, () => false, 200);

    expect(deps.taskRunner.run).not.toHaveBeenCalled();
    expect(deps.ledger.getAllPending()).toHaveLength(0);
  });

  it("processes multiple operations sequentially", async () => {
    const issue1 = makeWorkItem("DF-400", "First task");
    const issue2 = makeWorkItem("DF-401", "Second task");

    const deps = buildMockDeps(tempDir, {
      issues: [issue1, issue2],
      comments: {
        "DF-400": [makeWorkItemComment(CID, "@docs first")],
        "DF-401": [makeWorkItemComment("C2", "@docs second")],
      },
    });

    const orchestrator = new Orchestrator(deps);

    await runUntil(orchestrator, () => orchestrator.observer.getState().completedToday.length >= 2);

    expect(deps.taskRunner.run).toHaveBeenCalledTimes(2);
    const state = orchestrator.observer.getState();
    expect(state.completedToday).toHaveLength(2);
    expect(state.completedToday.map((c) => c.key).sort()).toEqual(["DF-400", "DF-401"]);
  });

  it("recovers crashed operations on startup", async () => {
    const profile = makeProfile({
      id: "ralph-docs",
      agentName: "ralph",
      match: {
        projects: [PROJECT],
        statuses: [],
        commentTrigger: "@docs",
        revisionStatuses: [],
      },
    });

    const deps = buildBaseDeps(tempDir, {
      profiles: [profile],
      logDirName: "crash-logs",
    });

    // Simulate a previously crashed operation
    deps.ledger.plan("DF-500", {
      dataSource: DS,
      variant: "ralph-docs:ralph:@docs",
      triggerCommentId: CID,
      commentTimestamp: TS,
    });
    const ops = deps.ledger.getOperations(DS, "DF-500");
    deps.ledger.transition(DS, "DF-500", ops[0].id, OperationStatus.Active);

    const orchestrator = new Orchestrator(deps);

    // Recovery happens at startup, then loop idles -> timeout stops it
    await runUntil(orchestrator, () => false, 200);

    const recoveredOps = deps.ledger.getOperations(DS, "DF-500");
    expect(recoveredOps[0].status).toBe(OperationStatus.Error);

    expect(deps.issueManager.postCrashRecoveryComment).toHaveBeenCalledWith(DS, "DF-500", "ralph-docs:ralph:@docs");
  });

  it("tracks state transitions during execution", async () => {
    const issue = makeWorkItem("DF-600", "State tracking test");
    const deps = buildMockDeps(tempDir, {
      issues: [issue],
      comments: {
        "DF-600": [makeWorkItemComment(CID, "@docs go")],
      },
    });

    const states: string[] = [];
    const orchestrator = new Orchestrator(deps);

    orchestrator.observer.onStateChange((state) => {
      states.push(state.status);
    });

    await runUntil(orchestrator, () => orchestrator.observer.getState().completedToday.length > 0);

    expect(states).toContain(OrchestratorStatus.Working);
    expect(states).toContain(OrchestratorStatus.Stopping);
  });

  it("emits heartbeat payload with correct shape", async () => {
    const issue = makeWorkItem("DF-700", "Heartbeat test");
    const deps = buildMockDeps(tempDir, {
      issues: [issue],
      comments: {
        "DF-700": [makeWorkItemComment(CID, "@docs go")],
      },
    });

    const orchestrator = new Orchestrator(deps);

    await runUntil(orchestrator, () => orchestrator.observer.getState().completedToday.length > 0);

    const payload = orchestrator.observer.getHeartbeatPayload();
    expect(payload).toHaveProperty("agentId");
    expect(payload).toHaveProperty("status");
    expect(payload).toHaveProperty("totalProcessed");
    expect(payload.totalProcessed).toBe(1);
    expect(payload.status).toBe(HeartbeatStatus.Stopped);
  });

  it("deduplicates trigger comments across multiple poll cycles", async () => {
    const issue = makeWorkItem("DF-800", "Dedup test");
    const deps = buildMockDeps(tempDir, {
      issues: [issue],
      comments: {
        "DF-800": [makeWorkItemComment(CID, "@docs handle please")],
      },
    });

    // Return the same issue on every drain call — the trigger scanner
    // should only plan one operation because the comment is already consumed.
    deps.pollers.get(DS)!.drain = vi.fn().mockReturnValue([issue]);

    const orchestrator = new Orchestrator(deps);

    await runUntil(orchestrator, () => orchestrator.observer.getState().completedToday.length > 0);

    // Despite the issue being returned on every drain, only 1 op was executed
    expect(deps.taskRunner.run).toHaveBeenCalledTimes(1);
    const ops = deps.ledger.getOperations(DS, "DF-800");
    expect(ops).toHaveLength(1);
  });

  it("resolves correct profile when same agent has variants for different projects", async () => {
    const dfProfile = makeProfile({
      id: "ralph-docs",
      agentName: "ralph",
      match: {
        projects: [PROJECT],
        statuses: ["To Do"],
        commentTrigger: "@RalphDf",
        revisionStatuses: [],
      },
    });
    const docProfile = makeProfile({
      id: "ralph-docs",
      agentName: "ralph",
      match: {
        projects: ["DOC"],
        statuses: ["To Do"],
        commentTrigger: "@RalphDocs",
        revisionStatuses: [],
      },
    });

    // Variant keys must be distinct even though id + agentName are the same
    expect(dfProfile.variantKey).not.toBe(docProfile.variantKey);
    expect(dfProfile.variantKey).toBe("ralph-docs:ralph:@RalphDf");
    expect(docProfile.variantKey).toBe("ralph-docs:ralph:@RalphDocs");

    const docIssue = makeWorkItem("DOC-100", "VS Code docs", "To Do");

    const deps = buildBaseDeps(tempDir, {
      profiles: [dfProfile, docProfile],
      issueManager: {
        refreshWorkItem: vi.fn().mockResolvedValue(docIssue),
      },
      taskRunner: {
        run: vi.fn().mockResolvedValue(makeResult("DOC-100")),
      },
      logDirName: "multi-variant-logs",
    });

    // Plan an operation for the DOC variant
    deps.ledger.plan("DOC-100", {
      dataSource: DS,
      variant: docProfile.variantKey,
      triggerCommentId: CID,
      commentTimestamp: TS,
    });

    const orchestrator = new Orchestrator(deps);
    await runUntil(orchestrator, () => orchestrator.observer.getState().completedToday.length > 0);

    // The orchestrator must find the DOC profile (not the DF one) and execute
    expect(deps.taskRunner.run).toHaveBeenCalledTimes(1);
    expect(vi.mocked(deps.taskRunner.run).mock.calls[0][0].profile).toBe(docProfile);
  });

  it("tears down all profiles on startup to clean abandoned containers", async () => {
    const profile1 = makeProfile({
      id: "ralph-docs",
      agentName: "ralph",
      match: { projects: [PROJECT], statuses: [], commentTrigger: "@docs", revisionStatuses: [] },
    });
    const profile2 = makeProfile({
      id: "ralph-vscode",
      agentName: "ralph",
      match: { projects: ["DOC"], statuses: [], commentTrigger: "@vscode", revisionStatuses: [] },
    });

    const deps = buildBaseDeps(tempDir, {
      profiles: [profile1, profile2],
      logDirName: "cleanup-logs",
    });

    const orchestrator = new Orchestrator(deps);
    await runUntil(orchestrator, () => false, 200);

    // Both profiles should have been torn down with null container (force path)
    expect(deps.taskRunner.teardown).toHaveBeenCalledWith(profile1, null);
    expect(deps.taskRunner.teardown).toHaveBeenCalledWith(profile2, null);
  });

  it("continues cleanup when one profile teardown fails", async () => {
    const profile1 = makeProfile({
      id: "ralph-docs",
      agentName: "ralph",
      match: { projects: [PROJECT], statuses: [], commentTrigger: "@docs", revisionStatuses: [] },
    });
    const profile2 = makeProfile({
      id: "ralph-vscode",
      agentName: "ralph",
      match: { projects: ["DOC"], statuses: [], commentTrigger: "@vscode", revisionStatuses: [] },
    });

    const deps = buildBaseDeps(tempDir, {
      profiles: [profile1, profile2],
      taskRunner: {
        teardown: vi.fn().mockImplementation(async (profile: IAgentProfile) => {
          if (profile.id === "ralph-docs") throw new Error("compose stuck");
        }),
      },
      logDirName: "cleanup-fail-logs",
    });

    const orchestrator = new Orchestrator(deps);
    await runUntil(orchestrator, () => false, 200);

    // Both profiles should have been attempted despite the first one failing
    expect(deps.taskRunner.teardown).toHaveBeenCalledWith(profile1, null);
    expect(deps.taskRunner.teardown).toHaveBeenCalledWith(profile2, null);
  });

  it("rejects revision task when no PR URL or handoff exists", async () => {
    const profile = makeProfile({
      id: "ralph-docs",
      agentName: "ralph",
      match: {
        projects: [PROJECT],
        statuses: ["Defect Found"],
        commentTrigger: "@docs",
        revisionStatuses: ["Defect Found"],
      },
    });

    const issue = makeWorkItem("DF-900", "Revision without PR", "Defect Found");

    const deps = buildBaseDeps(tempDir, {
      profiles: [profile],
      issueManager: {
        refreshWorkItem: vi.fn().mockResolvedValue(issue),
        getComments: vi.fn().mockResolvedValue([makeWorkItemComment(CID, "No PR link here")]),
      },
      taskRunner: {
        run: vi.fn().mockResolvedValue(makeResult("DF-900")),
      },
      logDirName: "revision-preflight-logs",
    });

    // fetchHandoff returns null — no handoff attachment
    vi.mocked(deps.resources.fetchHandoff).mockResolvedValue(null);

    deps.ledger.plan("DF-900", {
      dataSource: DS,
      variant: profile.variantKey,
      triggerCommentId: CID,
      commentTimestamp: TS,
    });

    const orchestrator = new Orchestrator(deps);
    await runUntil(orchestrator, () => {
      const ops = deps.ledger.getOperations(DS, "DF-900");
      return ops.length > 0 && ops[0].status === OperationStatus.Rejected;
    });

    const ops = deps.ledger.getOperations(DS, "DF-900");
    expect(ops[0].status).toBe(OperationStatus.Rejected);
    expect(ops[0].reason).toContain("revision-ready");
    expect(deps.taskRunner.run).not.toHaveBeenCalled();
    expect(deps.issueManager.postComment).toHaveBeenCalledWith(DS, "DF-900", expect.stringContaining("can't proceed"));
  });

  it("allows revision task when PR URL and handoff exist", async () => {
    const profile = makeProfile({
      id: "ralph-docs",
      agentName: "ralph",
      match: {
        projects: [PROJECT],
        statuses: ["Defect Found"],
        commentTrigger: "@docs",
        revisionStatuses: ["Defect Found"],
      },
    });

    const issue = makeWorkItem("DF-901", "Revision with PR", "Defect Found");

    const deps = buildBaseDeps(tempDir, {
      profiles: [profile],
      issueManager: {
        refreshWorkItem: vi.fn().mockResolvedValue(issue),
        getComments: vi
          .fn()
          .mockResolvedValue([makeWorkItemComment(CID, "PR: https://dev.azure.com/org/proj/_git/repo/pullrequest/42")]),
      },
      taskRunner: {
        run: vi.fn().mockResolvedValue(makeResult("DF-901")),
      },
      logDirName: "revision-pass-logs",
    });

    vi.mocked(deps.resources.fetchHandoff).mockResolvedValue("## Handoff\nPrevious work done.");

    deps.ledger.plan("DF-901", {
      dataSource: DS,
      variant: profile.variantKey,
      triggerCommentId: CID,
      commentTimestamp: TS,
    });

    const orchestrator = new Orchestrator(deps);
    await runUntil(orchestrator, () => orchestrator.observer.getState().completedToday.length > 0);

    expect(deps.taskRunner.run).toHaveBeenCalledTimes(1);
    const ops = deps.ledger.getOperations(DS, "DF-901");
    expect(ops[0].status).toBe(OperationStatus.Completed);
  });

  it("skips revision preflight for non-revision status on same profile", async () => {
    const profile = makeProfile({
      id: "ralph-docs",
      agentName: "ralph",
      match: {
        projects: [PROJECT],
        statuses: ["New", "Defect Found"],
        commentTrigger: "@docs",
        revisionStatuses: ["Defect Found"],
      },
    });

    // Issue is in "New" — not a revision status
    const issue = makeWorkItem("DF-902", "Standard task", "New");

    const deps = buildBaseDeps(tempDir, {
      profiles: [profile],
      issueManager: {
        refreshWorkItem: vi.fn().mockResolvedValue(issue),
        // No getComments mock needed — revision preflight should not run
      },
      taskRunner: {
        run: vi.fn().mockResolvedValue(makeResult("DF-902")),
      },
      logDirName: "non-revision-logs",
    });

    deps.ledger.plan("DF-902", {
      dataSource: DS,
      variant: profile.variantKey,
      triggerCommentId: CID,
      commentTimestamp: TS,
    });

    const orchestrator = new Orchestrator(deps);
    await runUntil(orchestrator, () => orchestrator.observer.getState().completedToday.length > 0);

    // Task should proceed without any preflight check
    expect(deps.taskRunner.run).toHaveBeenCalledTimes(1);
    expect(deps.resources.fetchHandoff).not.toHaveBeenCalled();
  });

  describe("pre-activation failures", () => {
    const LIVE_TS = "2026-01-01T01:00:00Z";

    function makeDocsProfile(statuses: string[] = [], revisionStatuses: string[] = []): IAgentProfile {
      return makeProfile({
        id: "ralph-docs",
        agentName: "ralph",
        match: { projects: [PROJECT], statuses, commentTrigger: "@docs", revisionStatuses },
      });
    }

    it("records error for an operation whose profile no longer exists and moves on to the next one", async () => {
      const profile = makeDocsProfile();
      const liveIssue = makeWorkItem("DF-1001", "Live task");
      const deps = buildBaseDeps(tempDir, {
        profiles: [profile],
        issueManager: { refreshWorkItem: vi.fn().mockResolvedValue(liveIssue) },
        logDirName: "missing-profile-logs",
      });

      // Planned before the variant was removed from profile.json, then the orchestrator restarted.
      deps.ledger.plan("DF-1000", {
        dataSource: DS,
        variant: "ralph-removed:ralph:@removed",
        triggerCommentId: CID,
        commentTimestamp: TS,
      });
      deps.ledger.plan("DF-1001", {
        dataSource: DS,
        variant: profile.variantKey,
        triggerCommentId: "C2",
        commentTimestamp: LIVE_TS,
      });

      const orchestrator = new Orchestrator(deps);
      await runUntil(orchestrator, () => orchestrator.observer.getState().completedToday.length > 0);

      const [orphan] = deps.ledger.getOperations(DS, "DF-1000");
      expect(orphan.status).toBe(OperationStatus.Error);
      expect(orphan.reason).toBe("Profile ralph-removed:ralph:@removed no longer exists");
      expect(orphan.completedAt).toBeDefined();
      expect(deps.issueManager.refreshWorkItem).not.toHaveBeenCalledWith(DS, "DF-1000");

      expect(deps.taskRunner.run).toHaveBeenCalledTimes(1);
      expect(vi.mocked(deps.taskRunner.run).mock.calls[0][0].workItem.id).toBe("DF-1001");
      expect(deps.ledger.getAllPending()).toHaveLength(0);
    });

    it("records error for an operation whose work item is unreachable and moves on to the next one", async () => {
      const profile = makeDocsProfile();
      const liveIssue = makeWorkItem("DF-1003", "Live task");
      const deps = buildBaseDeps(tempDir, {
        profiles: [profile],
        issueManager: {
          refreshWorkItem: vi
            .fn()
            .mockImplementation(async (_source: string, key: string) => (key === "DF-1003" ? liveIssue : null)),
        },
        logDirName: "unreachable-item-logs",
      });

      deps.ledger.plan("DF-1002", {
        dataSource: DS,
        variant: profile.variantKey,
        triggerCommentId: CID,
        commentTimestamp: TS,
      });
      deps.ledger.plan("DF-1003", {
        dataSource: DS,
        variant: profile.variantKey,
        triggerCommentId: "C2",
        commentTimestamp: LIVE_TS,
      });

      const orchestrator = new Orchestrator(deps);
      await runUntil(orchestrator, () => orchestrator.observer.getState().completedToday.length > 0);

      const [unreachable] = deps.ledger.getOperations(DS, "DF-1002");
      expect(unreachable.status).toBe(OperationStatus.Error);
      expect(unreachable.reason).toBe("Work item not found or unreachable");
      expect(unreachable.completedAt).toBeDefined();
      expect(deps.issueManager.refreshWorkItem).toHaveBeenCalledTimes(2);

      expect(deps.taskRunner.run).toHaveBeenCalledTimes(1);
      expect(vi.mocked(deps.taskRunner.run).mock.calls[0][0].workItem.id).toBe("DF-1003");
      expect(deps.ledger.getAllPending()).toHaveLength(0);
    });

    it("records error when a pre-activation phase throws instead of crashing the loop", async () => {
      const profile = makeDocsProfile(["New", "Defect Found"], ["Defect Found"]);
      const revisionIssue = makeWorkItem("DF-1004", "Revision task", "Defect Found");
      const liveIssue = makeWorkItem("DF-1005", "Live task", "New");
      const deps = buildBaseDeps(tempDir, {
        profiles: [profile],
        issueManager: {
          refreshWorkItem: vi
            .fn()
            .mockImplementation(async (_source: string, key: string) =>
              key === "DF-1004" ? revisionIssue : liveIssue,
            ),
          getComments: vi.fn().mockRejectedValue(new Error("JIRA responded 503 Service Unavailable")),
        },
        logDirName: "preflight-throw-logs",
      });

      deps.ledger.plan("DF-1004", {
        dataSource: DS,
        variant: profile.variantKey,
        triggerCommentId: CID,
        commentTimestamp: TS,
      });
      deps.ledger.plan("DF-1005", {
        dataSource: DS,
        variant: profile.variantKey,
        triggerCommentId: "C2",
        commentTimestamp: LIVE_TS,
      });

      const orchestrator = new Orchestrator(deps);
      await runUntil(orchestrator, () => orchestrator.observer.getState().completedToday.length > 0);

      const [failed] = deps.ledger.getOperations(DS, "DF-1004");
      expect(failed.status).toBe(OperationStatus.Error);
      expect(failed.reason).toContain("JIRA responded 503 Service Unavailable");
      expect(failed.completedAt).toBeDefined();

      expect(deps.taskRunner.run).toHaveBeenCalledTimes(1);
      expect(vi.mocked(deps.taskRunner.run).mock.calls[0][0].workItem.id).toBe("DF-1005");
      expect(deps.ledger.getAllPending()).toHaveLength(0);
    });
  });
});
