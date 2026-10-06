/**
 * LogSourceRegistry behavior tests.
 *
 * The registry is a pure configuration layer — it declares which log sources
 * and folder exports to register on a collector. Tests use a lightweight fake
 * collector that accumulates registrations in-memory, so assertions read
 * naturally against the registered source set rather than mock call details.
 *
 * Organized by behavior:
 * - standard source registration (the full set)
 * - callback-driven streaming mode
 * - dynamic path interpolation from profile/CLI paths
 * - folder exports
 */
import { describe, it, expect, vi } from "vitest";
import { LogSourceRegistry } from "../../src/container/log-source-registry.js";
import {
  CaptureMode,
  type LogSourceDef,
  type FolderExportDef,
  type IContainerLogCollector,
} from "../../src/container/log-collector.js";
import type { CliPaths } from "../../src/container/types.js";
import { makeProfile } from "../helpers/factories.js";

const TASK_ID = "DF-100-1234567890000";
const WORK_ITEM_ID = "DF-100";

const cliPaths: CliPaths = {
  configDir: "/workspace/.ralph",
  writableDirs: ["/workspace/.ralph/logs", "/workspace/.ralph/logs/cli-debug", "/workspace/.ralph/session-state"],
  transcriptPath: "/workspace/.ralph/logs/session-transcript.md",
  logDir: "/workspace/.ralph/logs/cli-debug",
};

// Fake collector that accumulates registrations in-memory for easy assertion.
// No vi.fn() needed — the state itself is the observable output.
interface FakeCollector extends IContainerLogCollector {
  taskId: string | null;
  sources: LogSourceDef[];
  exports: FolderExportDef[];
  attached: boolean;
}

function createFakeCollector(): FakeCollector {
  return {
    taskId: null,
    sources: [],
    exports: [],
    attached: false,
    setTaskId(key) {
      this.taskId = key;
    },
    addSource(source) {
      this.sources.push(source);
    },
    addExport(folder) {
      this.exports.push(folder);
    },
    attach() {
      this.attached = true;
    },
    detach: vi.fn(),
    collectAll: vi.fn().mockResolvedValue([]),
    clearCollectSources: vi.fn().mockResolvedValue(undefined),
  };
}

function source(collector: FakeCollector, id: string): LogSourceDef | undefined {
  return collector.sources.find((s) => s.id === id);
}

function folder(collector: FakeCollector, id: string): FolderExportDef | undefined {
  return collector.exports.find((e) => e.id === id);
}

describe("LogSourceRegistry", () => {
  const registry = new LogSourceRegistry();
  const profile = makeProfile({ auditLogPath: "/workspace/.ralph/logs/audit.jsonl" });

  describe("standard source registration", () => {
    it("registers all expected log sources and exports", () => {
      const collector = createFakeCollector();

      registry.registerAll(collector, profile, TASK_ID, WORK_ITEM_ID, {}, cliPaths);

      const sourceIds = collector.sources.map((s) => s.id);
      expect(sourceIds).toContain("audit");
      expect(sourceIds).toContain("transcript");
      expect(sourceIds).toContain("pre-tool");
      expect(sourceIds).toContain("tool-output");
      expect(sourceIds).toContain("proxy");
      expect(sourceIds).toContain("cli-debug");
      expect(sourceIds).toContain("sidecar");
      expect(sourceIds).toContain("state");

      const exportIds = collector.exports.map((e) => e.id);
      expect(exportIds).toContain("session-state");
      expect(exportIds).toContain("artifacts");
    });

    it("sets the task ID on the collector", () => {
      const collector = createFakeCollector();

      registry.registerAll(collector, profile, TASK_ID, WORK_ITEM_ID, {}, cliPaths);

      expect(collector.taskId).toBe(TASK_ID);
    });

    it("starts streaming after all sources are registered", () => {
      const collector = createFakeCollector();

      registry.registerAll(collector, profile, TASK_ID, WORK_ITEM_ID, {}, cliPaths);

      expect(collector.attached).toBe(true);
      // Sources were registered before attach — the fake accumulates them
      expect(collector.sources.length).toBeGreaterThan(0);
    });
  });

  describe("callback-driven streaming mode", () => {
    it("registers pre-tool in collect mode when no callback is provided", () => {
      const collector = createFakeCollector();

      registry.registerAll(collector, profile, TASK_ID, WORK_ITEM_ID, {}, cliPaths);

      expect(source(collector, "pre-tool")?.mode).toBe(CaptureMode.Collect);
      expect(source(collector, "pre-tool")?.onLine).toBeUndefined();
    });

    it("switches pre-tool to stream mode when callback is provided", () => {
      const collector = createFakeCollector();
      const onPreToolUse = vi.fn();

      registry.registerAll(collector, profile, TASK_ID, WORK_ITEM_ID, { onPreToolUse }, cliPaths);

      expect(source(collector, "pre-tool")?.mode).toBe(CaptureMode.Stream);
      expect(source(collector, "pre-tool")?.onLine).toBe(onPreToolUse);
    });

    it("registers tool-output in collect mode when no callback is provided", () => {
      const collector = createFakeCollector();

      registry.registerAll(collector, profile, TASK_ID, WORK_ITEM_ID, {}, cliPaths);

      expect(source(collector, "tool-output")?.mode).toBe(CaptureMode.Collect);
      expect(source(collector, "tool-output")?.onLine).toBeUndefined();
    });

    it("switches tool-output to stream mode when callback is provided", () => {
      const collector = createFakeCollector();
      const onToolOutput = vi.fn();

      registry.registerAll(collector, profile, TASK_ID, WORK_ITEM_ID, { onToolOutput }, cliPaths);

      expect(source(collector, "tool-output")?.mode).toBe(CaptureMode.Stream);
      expect(source(collector, "tool-output")?.onLine).toBe(onToolOutput);
    });

    it("registers cli-debug in collect mode when no callback is provided", () => {
      const collector = createFakeCollector();

      registry.registerAll(collector, profile, TASK_ID, WORK_ITEM_ID, {}, cliPaths);

      expect(source(collector, "cli-debug")?.mode).toBe(CaptureMode.Collect);
      expect(source(collector, "cli-debug")?.onLine).toBeUndefined();
    });

    it("switches cli-debug to stream mode when callback is provided", () => {
      const collector = createFakeCollector();
      const onCliDebug = vi.fn();

      registry.registerAll(collector, profile, TASK_ID, WORK_ITEM_ID, { onCliDebug }, cliPaths);

      expect(source(collector, "cli-debug")?.mode).toBe(CaptureMode.Stream);
      expect(source(collector, "cli-debug")?.onLine).toBe(onCliDebug);
    });

    it("always streams the sidecar via compose logs regardless of callbacks", () => {
      const collector = createFakeCollector();

      registry.registerAll(collector, profile, TASK_ID, WORK_ITEM_ID, {}, cliPaths);

      expect(source(collector, "sidecar")?.mode).toBe(CaptureMode.Stream);
      expect(source(collector, "sidecar")?.useComposeLogs).toBe(true);
    });
  });

  describe("dynamic path interpolation", () => {
    it("uses the profile audit log path for the audit source", () => {
      const collector = createFakeCollector();

      registry.registerAll(collector, profile, TASK_ID, WORK_ITEM_ID, {}, cliPaths);

      expect(source(collector, "audit")?.containerPath).toBe(profile.auditLogPath);
    });

    it("uses cliPaths.transcriptPath for the transcript source", () => {
      const collector = createFakeCollector();

      registry.registerAll(collector, profile, TASK_ID, WORK_ITEM_ID, {}, cliPaths);

      expect(source(collector, "transcript")?.containerPath).toBe(cliPaths.transcriptPath);
    });

    it("uses cliPaths.logDir in cli-debug glob patterns", () => {
      const collector = createFakeCollector();

      registry.registerAll(collector, profile, TASK_ID, WORK_ITEM_ID, {}, cliPaths);

      const cliDebug = source(collector, "cli-debug")!;
      expect(cliDebug.collectArgs?.join(" ")).toContain(cliPaths.logDir);
      expect(cliDebug.streamArgs?.join(" ")).toContain(cliPaths.logDir);
    });

    it("uses workItemId (not taskId) for the state source path", () => {
      const collector = createFakeCollector();

      registry.registerAll(collector, profile, TASK_ID, WORK_ITEM_ID, {}, cliPaths);

      expect(source(collector, "state")?.containerPath).toBe(`/workspace/.ralph/tasks/${WORK_ITEM_ID}/state.md`);
    });

    it("uses workItemId (not taskId) for the artifacts export path", () => {
      const collector = createFakeCollector();

      registry.registerAll(collector, profile, TASK_ID, WORK_ITEM_ID, {}, cliPaths);

      expect(folder(collector, "artifacts")?.containerPath).toBe(`/workspace/.ralph/tasks/${WORK_ITEM_ID}/artifacts`);
    });
  });
});
