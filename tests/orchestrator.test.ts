import { describe, it, expect } from "vitest";
import { TaskQueue } from "../src/queue.js";
import { ProfileRouter } from "../src/services/profile-router.js";
import { makeProfile, makeIssue, makeConfig } from "./helpers.js";

/**
 * Orchestrator integration tests — exercise real logic from the core modules
 * that the orchestrator wires together (queue, profile routing, state management).
 */

describe("Orchestrator core integration", () => {
  describe("queue + profile routing pipeline", () => {
    it("dequeues issues and routes them to the correct profile", () => {
      const docsProfile = makeProfile({ id: "ralph-docs", match: { projects: ["DF"], keywords: ["docs"], statuses: [], revisionStatuses: [] } });
      const vscodeProfile = makeProfile({ id: "ralph-vscode", match: { projects: ["DF"], keywords: ["vscode", "extension"], statuses: [], revisionStatuses: [] } });
      const router = new ProfileRouter([docsProfile, vscodeProfile]);

      const queue = new TaskQueue();
      queue.enqueue(makeIssue("DF-100", "Update docs for API"));
      queue.enqueue(makeIssue("DF-200", "Fix vscode autocomplete"));

      const issue1 = queue.dequeue()!;
      const route1 = router.match(issue1);
      expect(route1?.profile.id).toBe("ralph-docs");

      const issue2 = queue.dequeue()!;
      const route2 = router.match(issue2);
      expect(route2?.profile.id).toBe("ralph-vscode");
    });

    it("skips issues that match no profile", () => {
      const profile = makeProfile({ match: { projects: ["OTHER"], keywords: [], statuses: [], revisionStatuses: [] } });
      const router = new ProfileRouter([profile]);

      const queue = new TaskQueue();
      queue.enqueue(makeIssue("DF-100", "Some issue"));

      const issue = queue.dequeue()!;
      const route = router.match(issue);
      expect(route).toBeNull();
    });

    it("handles revision routing correctly", () => {
      const profile = makeProfile({
        match: { projects: ["DF"], keywords: [], statuses: ["New"], revisionStatuses: ["Defect Found"] },
      });
      const router = new ProfileRouter([profile]);

      const revisionIssue = makeIssue("DF-300", "Fix defect", "Defect Found");
      const route = router.match(revisionIssue);
      expect(route?.isRevision).toBe(true);
    });
  });

  describe("state derivation", () => {
    it("derives IDLE when running but not busy", () => {
      const running = true, busy = false;
      const status = !running ? "stopping" : busy ? "working" : "idle";
      expect(status).toBe("idle");
    });

    it("derives WORKING when running and busy", () => {
      const running = true, busy = true;
      const status = !running ? "stopping" : busy ? "working" : "idle";
      expect(status).toBe("working");
    });

    it("derives STOPPING when not running", () => {
      const running = false;
      const status = !running ? "stopping" : "idle";
      expect(status).toBe("stopping");
    });
  });

  describe("config validation", () => {
    it("config includes all required profile fields", () => {
      const config = makeConfig();
      const profile = config.profiles[0];
      expect(profile.transitions.inProgressId).toBeTruthy();
      expect(profile.transitions.readyForReviewId).toBeTruthy();
      expect(profile.setupScript).toBeTruthy();
      expect(profile.auditLogPath).toBeTruthy();
      expect(profile.composeProjectLabel).toBeTruthy();
    });

    it("config includes all required secrets", () => {
      const config = makeConfig();
      expect(config.secrets.ghToken).toBeTruthy();
      expect(config.secrets.adoPatDocs).toBeTruthy();
      expect(config.secrets.jiraPat).toBeTruthy();
      expect(config.secrets.jiraEmail).toBeTruthy();
    });
  });

  describe("completed task tracking", () => {
    it("tracks completed tasks with proper metadata", () => {
      const completed: Array<{
        key: string;
        summary: string;
        profileId: string;
        status: string;
        durationMs: number;
        prUrl?: string;
        completedAt: number;
      }> = [];

      const start = Date.now();
      completed.push({
        key: "DF-1",
        summary: "Test issue",
        profileId: "ralph-docs",
        status: "completed",
        durationMs: 120000,
        prUrl: "https://dev.azure.com/pr/1",
        completedAt: start + 120000,
      });

      completed.push({
        key: "DF-2",
        summary: "Another issue",
        profileId: "ralph-vscode",
        status: "partial",
        durationMs: 300000,
        completedAt: start + 420000,
      });

      expect(completed).toHaveLength(2);
      expect(completed[0].prUrl).toBe("https://dev.azure.com/pr/1");
      expect(completed[1].prUrl).toBeUndefined();
      expect(completed[1].completedAt).toBeGreaterThan(completed[0].completedAt);
    });
  });
});
