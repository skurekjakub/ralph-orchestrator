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
import { LogSourceRegistry } from "../../src/container/log-source-registry";
import {
  CaptureMode,
  type LogSourceDef,
  type FolderExportDef,
  type IContainerLogCollector,
} from "../../src/container/log-collector";
import { ClaudeCodeRuntime } from "../../src/cli/claude/claude-runtime";
import { CopilotRuntime } from "../../src/cli/copilot/copilot-runtime";
import { COPILOT_CONTAINER_LAYOUT } from "../../src/cli/copilot/copilot-layout";
import { ClaudeAuthMode } from "../../src/config/types";
import { makeProfile } from "../helpers/factories";

const TASK_ID = "DF-100-1234567890000";
const WORK_ITEM_ID = "DF-100";

const COPILOT = new CopilotRuntime();
const CLAUDE = new ClaudeCodeRuntime({ claudeAuth: ClaudeAuthMode.OAuthToken });

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

      registry.registerAll(collector, profile, TASK_ID, WORK_ITEM_ID, {}, [COPILOT]);

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

      registry.registerAll(collector, profile, TASK_ID, WORK_ITEM_ID, {}, [COPILOT]);

      expect(collector.taskId).toBe(TASK_ID);
    });

    it("starts streaming after all sources are registered", () => {
      const collector = createFakeCollector();

      registry.registerAll(collector, profile, TASK_ID, WORK_ITEM_ID, {}, [COPILOT]);

      expect(collector.attached).toBe(true);
      // Sources were registered before attach — the fake accumulates them
      expect(collector.sources.length).toBeGreaterThan(0);
    });
  });

  describe("callback-driven streaming mode", () => {
    it("registers pre-tool in collect mode when no callback is provided", () => {
      const collector = createFakeCollector();

      registry.registerAll(collector, profile, TASK_ID, WORK_ITEM_ID, {}, [COPILOT]);

      expect(source(collector, "pre-tool")?.mode).toBe(CaptureMode.Collect);
      expect(source(collector, "pre-tool")?.onLine).toBeUndefined();
    });

    it("switches pre-tool to stream mode when callback is provided", () => {
      const collector = createFakeCollector();
      const onPreToolUse = vi.fn();

      registry.registerAll(collector, profile, TASK_ID, WORK_ITEM_ID, { onPreToolUse }, [COPILOT]);

      expect(source(collector, "pre-tool")?.mode).toBe(CaptureMode.Stream);
      expect(source(collector, "pre-tool")?.onLine).toBe(onPreToolUse);
    });

    it("registers tool-output in collect mode when no callback is provided", () => {
      const collector = createFakeCollector();

      registry.registerAll(collector, profile, TASK_ID, WORK_ITEM_ID, {}, [COPILOT]);

      expect(source(collector, "tool-output")?.mode).toBe(CaptureMode.Collect);
      expect(source(collector, "tool-output")?.onLine).toBeUndefined();
    });

    it("switches tool-output to stream mode when callback is provided", () => {
      const collector = createFakeCollector();
      const onToolOutput = vi.fn();

      registry.registerAll(collector, profile, TASK_ID, WORK_ITEM_ID, { onToolOutput }, [COPILOT]);

      expect(source(collector, "tool-output")?.mode).toBe(CaptureMode.Stream);
      expect(source(collector, "tool-output")?.onLine).toBe(onToolOutput);
    });

    it("registers cli-debug in collect mode when no callback is provided", () => {
      const collector = createFakeCollector();

      registry.registerAll(collector, profile, TASK_ID, WORK_ITEM_ID, {}, [COPILOT]);

      expect(source(collector, "cli-debug")?.mode).toBe(CaptureMode.Collect);
      expect(source(collector, "cli-debug")?.onLine).toBeUndefined();
    });

    it("switches cli-debug to stream mode when callback is provided", () => {
      const collector = createFakeCollector();
      const onCliDebug = vi.fn();

      registry.registerAll(collector, profile, TASK_ID, WORK_ITEM_ID, { onCliDebug }, [COPILOT]);

      expect(source(collector, "cli-debug")?.mode).toBe(CaptureMode.Stream);
      expect(source(collector, "cli-debug")?.onLine).toBe(onCliDebug);
    });

    it("always streams the sidecar via compose logs regardless of callbacks", () => {
      const collector = createFakeCollector();

      registry.registerAll(collector, profile, TASK_ID, WORK_ITEM_ID, {}, [COPILOT]);

      expect(source(collector, "sidecar")?.mode).toBe(CaptureMode.Stream);
      expect(source(collector, "sidecar")?.useComposeLogs).toBe(true);
    });
  });

  describe("per-CLI sources", () => {
    it("registers only the common sources when no container stage runs a CLI", () => {
      // Arrange
      const collector = createFakeCollector();

      // Act
      registry.registerAll(collector, profile, TASK_ID, WORK_ITEM_ID, {}, []);

      // Assert
      expect(collector.sources.map((s) => s.id)).toEqual([
        "audit",
        "pre-tool",
        "tool-output",
        "proxy",
        "sidecar",
        "state",
      ]);
      expect(collector.exports.map((e) => e.id)).toEqual(["artifacts"]);
    });

    it("registers Claude Code's single debug log file and its session transcripts, and no Copilot transcript", () => {
      // Arrange
      const collector = createFakeCollector();
      const onCliDebug = vi.fn();

      // Act
      registry.registerAll(collector, profile, TASK_ID, WORK_ITEM_ID, { onCliDebug }, [CLAUDE]);

      // Assert
      expect(source(collector, "claude-cli-debug")).toMatchObject({
        containerPath: "/workspace/.ralph/logs/cli-debug/claude.log",
        mode: CaptureMode.Stream,
        onLine: onCliDebug,
      });
      expect(source(collector, "claude-cli-debug")?.streamArgs).toBeUndefined();
      expect(folder(collector, "claude-sessions")?.containerPath).toBe("/workspace/.ralph/claude/projects");
      expect(source(collector, "transcript")).toBeUndefined();
      expect(folder(collector, "session-state")).toBeUndefined();
    });

    it("registers both CLIs' sources under distinct ids for a task whose container stages run both", () => {
      // Arrange
      const collector = createFakeCollector();

      // Act
      registry.registerAll(collector, profile, TASK_ID, WORK_ITEM_ID, {}, [CLAUDE, COPILOT]);

      // Assert
      const ids = [...collector.sources, ...collector.exports].map((s) => s.id);
      expect(ids).toEqual(expect.arrayContaining(["claude-cli-debug", "claude-sessions", "cli-debug", "transcript"]));
      expect(new Set(ids).size).toBe(ids.length);
    });
  });

  describe("dynamic path interpolation", () => {
    it("uses the profile audit log path for the audit source", () => {
      const collector = createFakeCollector();

      registry.registerAll(collector, profile, TASK_ID, WORK_ITEM_ID, {}, [COPILOT]);

      expect(source(collector, "audit")?.containerPath).toBe(profile.auditLogPath);
    });

    it("uses the Copilot transcript path for the transcript source", () => {
      const collector = createFakeCollector();

      registry.registerAll(collector, profile, TASK_ID, WORK_ITEM_ID, {}, [COPILOT]);

      expect(source(collector, "transcript")?.containerPath).toBe(COPILOT_CONTAINER_LAYOUT.transcriptPath);
    });

    it("uses the Copilot debug log directory in cli-debug glob patterns", () => {
      const collector = createFakeCollector();

      registry.registerAll(collector, profile, TASK_ID, WORK_ITEM_ID, {}, [COPILOT]);

      const cliDebug = source(collector, "cli-debug")!;
      expect(cliDebug.collectArgs?.join(" ")).toContain(COPILOT_CONTAINER_LAYOUT.debugLog.path);
      expect(cliDebug.streamArgs?.join(" ")).toContain(COPILOT_CONTAINER_LAYOUT.debugLog.path);
    });

    it("uses workItemId (not taskId) for the state source path", () => {
      const collector = createFakeCollector();

      registry.registerAll(collector, profile, TASK_ID, WORK_ITEM_ID, {}, [COPILOT]);

      expect(source(collector, "state")?.containerPath).toBe(`/workspace/.ralph/tasks/${WORK_ITEM_ID}/state.md`);
    });

    it("uses workItemId (not taskId) for the artifacts export path", () => {
      const collector = createFakeCollector();

      registry.registerAll(collector, profile, TASK_ID, WORK_ITEM_ID, {}, [COPILOT]);

      expect(folder(collector, "artifacts")?.containerPath).toBe(`/workspace/.ralph/tasks/${WORK_ITEM_ID}/artifacts`);
    });
  });
});
