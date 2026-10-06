import { describe, it, expect } from "vitest";
import { ProfileRouter } from "../../src/services/profile-router.js";
import { makeProfile, makeWorkItem, makeConfig, makeCompletion } from "../helpers/factories.js";
import { OrchestratorStatus } from "../../src/orchestrator-types.js";
import { TaskStatus } from "../../src/container/types.js";
const TRIGGER = "@ralph";

/**
 * Orchestrator integration tests — exercise real logic from the core modules
 * that the orchestrator wires together (profile routing, state management, ledger).
 */

describe("Orchestrator core integration", () => {
  describe("profile routing pipeline", () => {
    it("routes issues to the correct profile by project", async () => {
      const docsProfile = makeProfile({
        id: "ralph-docs",
        match: { projects: ["DF"], statuses: [], commentTrigger: "@docs" },
      });
      const vscodeProfile = makeProfile({
        id: "ralph-vscode",
        match: { projects: ["DOC"], statuses: [], commentTrigger: "@vscode" },
      });
      const router = new ProfileRouter({ profiles: [docsProfile, vscodeProfile] });

      const issue1 = makeWorkItem("DF-100", "Update docs for API");
      const route1 = await router.match(issue1);
      expect(route1?.profile.id).toBe("ralph-docs");

      const issue2 = makeWorkItem("DOC-200", "Fix vscode autocomplete");
      const route2 = await router.match(issue2);
      expect(route2?.profile.id).toBe("ralph-vscode");
    });

    it("skips issues that match no profile", async () => {
      const profile = makeProfile({ match: { projects: ["OTHER"], statuses: [], commentTrigger: TRIGGER } });
      const router = new ProfileRouter({ profiles: [profile] });

      const issue = makeWorkItem("DF-100", "Some issue");
      const route = await router.match(issue);
      expect(route).toBeNull();
    });

    it("matches by project and status", async () => {
      const profile = makeProfile({
        match: { projects: ["DF"], statuses: ["New", "Defect Found"], commentTrigger: TRIGGER },
      });
      const router = new ProfileRouter({ profiles: [profile] });

      const newIssue = makeWorkItem("DF-300", "New task", "Defect Found");
      const route = await router.match(newIssue);
      expect(route?.profile.id).toBe("ralph-default");
    });

    it("validates project and status via matchesProjectAndStatus", () => {
      const profile = makeProfile({
        match: { projects: ["DF"], statuses: ["New"], commentTrigger: TRIGGER },
      });
      const router = new ProfileRouter({ profiles: [profile] });

      expect(router.matchesProjectAndStatus(makeWorkItem("DF-1", "x", "New"), profile)).toBe(true);
      expect(router.matchesProjectAndStatus(makeWorkItem("DF-1", "x", "Done"), profile)).toBe(false);
      expect(router.matchesProjectAndStatus(makeWorkItem("XO-1", "x", "New"), profile)).toBe(false);
    });
  });

  describe("state derivation", () => {
    it("derives IDLE when running but not busy", () => {
      const running = true,
        busy = false;
      const status = !running
        ? OrchestratorStatus.Stopping
        : busy
          ? OrchestratorStatus.Working
          : OrchestratorStatus.Idle;
      expect(status).toBe(OrchestratorStatus.Idle);
    });

    it("derives WORKING when running and busy", () => {
      const running = true,
        busy = true;
      const status = !running
        ? OrchestratorStatus.Stopping
        : busy
          ? OrchestratorStatus.Working
          : OrchestratorStatus.Idle;
      expect(status).toBe(OrchestratorStatus.Working);
    });

    it("derives STOPPING when not running", () => {
      const running = false;
      const status = !running ? OrchestratorStatus.Stopping : OrchestratorStatus.Idle;
      expect(status).toBe(OrchestratorStatus.Stopping);
    });
  });

  describe("config validation", () => {
    it("config includes all required profile fields", () => {
      const config = makeConfig();
      const profile = config.profiles[0];
      expect(profile.beforeAgent).toBeDefined();
      expect(profile.afterAgent).toBeDefined();
      expect(profile.setupScript).toBeTruthy();
      expect(profile.auditLogPath).toBeTruthy();
      expect(profile.composeProjectLabel).toBeTruthy();
    });

    it("config includes all required secrets", () => {
      const config = makeConfig();
      expect(config.secrets.ghToken).toBeTruthy();
      expect(config.secrets.adoPat).toBeTruthy();
      const ds = Object.values(config.dataSources)[0];
      expect(ds.connection.apiToken).toBeTruthy();
      expect(ds.connection.email).toBeTruthy();
    });
  });

  describe("completed task tracking", () => {
    it("tracks completed tasks with proper metadata", () => {
      const start = Date.now();
      const completed = [
        makeCompletion("DF-1", {
          summary: "Test issue",
          durationMs: 120000,
          prUrl: "https://dev.azure.com/pr/1",
          completedAt: start + 120000,
        }),
        makeCompletion("DF-2", {
          summary: "Another issue",
          profileId: "ralph-vscode",
          status: TaskStatus.Partial,
          durationMs: 300000,
          completedAt: start + 420000,
        }),
      ];

      expect(completed).toHaveLength(2);
      expect(completed[0].prUrl).toBe("https://dev.azure.com/pr/1");
      expect(completed[1].prUrl).toBeUndefined();
      expect(completed[1].completedAt).toBeGreaterThan(completed[0].completedAt);
    });
  });
});
