import { describe, it, expect, vi } from "vitest";
import { LogSourceRegistry } from "../../src/container/log-source-registry.js";
import { CaptureMode, type IContainerLogCollector } from "../../src/container/log-collector.js";
import type { CliPaths } from "../../src/container/types.js";
import { makeProfile } from "../helpers/factories.js";

const TASK_ID = "DF-100-1234567890000";
const WORK_ITEM_ID = "DF-100";

function createMockCollector(): {
  collector: IContainerLogCollector;
  setTaskId: ReturnType<typeof vi.fn>;
  addSource: ReturnType<typeof vi.fn>;
  addExport: ReturnType<typeof vi.fn>;
  attach: ReturnType<typeof vi.fn>;
} {
  const setTaskId = vi.fn();
  const addSource = vi.fn();
  const addExport = vi.fn();
  const attach = vi.fn();
  const collector: IContainerLogCollector = { setTaskId, addSource, addExport, attach, detach: vi.fn(), collectAll: vi.fn(), clearCollectSources: vi.fn() };
  return { collector, setTaskId, addSource, addExport, attach };
}

describe("LogSourceRegistry", () => {
  const registry = new LogSourceRegistry();
  const profile = makeProfile({ auditLogPath: "/workspace/.ralph/logs/audit.jsonl" });
  const cliPaths: CliPaths = {
    configDir: "/workspace/.ralph",
    writableDirs: ["/workspace/.ralph/logs", "/workspace/.ralph/logs/cli-debug", "/workspace/.ralph/session-state"],
    transcriptPath: "/workspace/.ralph/logs/session-transcript.md",
    logDir: "/workspace/.ralph/logs/cli-debug",
  };

  describe("registerAll", () => {
    it("sets the issue key on the collector", () => {
      const { collector, setTaskId } = createMockCollector();

      registry.registerAll(collector, profile, TASK_ID, WORK_ITEM_ID, {}, cliPaths);

      expect(setTaskId).toHaveBeenCalledWith(TASK_ID);
    });

    it("registers all 8 standard log sources", () => {
      const { collector, addSource } = createMockCollector();

      registry.registerAll(collector, profile, TASK_ID, WORK_ITEM_ID, {}, cliPaths);

      expect(addSource).toHaveBeenCalledTimes(8);
      const ids = addSource.mock.calls.map((call: unknown[]) => (call[0] as { id: string }).id);
      expect(ids).toEqual(["audit", "transcript", "pre-tool", "tool-output", "proxy", "cli-debug", "sidecar", "state"]);
    });

    it("calls attach after registering sources", () => {
      const { collector, addSource, attach } = createMockCollector();

      registry.registerAll(collector, profile, TASK_ID, WORK_ITEM_ID, {}, cliPaths);

      // attach must be called after all addSource calls
      const addSourceOrder = addSource.mock.invocationCallOrder;
      const attachOrder = attach.mock.invocationCallOrder;
      expect(attachOrder[0]).toBeGreaterThan(addSourceOrder[addSourceOrder.length - 1]);
    });

    it("registers audit source with profile auditLogPath", () => {
      const { collector, addSource } = createMockCollector();

      registry.registerAll(collector, profile, TASK_ID, WORK_ITEM_ID, {}, cliPaths);

      expect(addSource).toHaveBeenCalledWith(
        expect.objectContaining({
          id: "audit",
          service: "app",
          containerPath: profile.auditLogPath,
          extension: "jsonl",
          mode: CaptureMode.Collect,
        }),
      );
    });

    it("registers transcript source with cliPaths.transcriptPath", () => {
      const { collector, addSource } = createMockCollector();

      registry.registerAll(collector, profile, TASK_ID, WORK_ITEM_ID, {}, cliPaths);

      expect(addSource).toHaveBeenCalledWith(
        expect.objectContaining({
          id: "transcript",
          containerPath: cliPaths.transcriptPath,
          mode: CaptureMode.Collect,
        }),
      );
    });

    it("registers pre-tool in collect mode when no callback provided", () => {
      const { collector, addSource } = createMockCollector();

      registry.registerAll(collector, profile, TASK_ID, WORK_ITEM_ID, {}, cliPaths);

      expect(addSource).toHaveBeenCalledWith(
        expect.objectContaining({
          id: "pre-tool",
          mode: CaptureMode.Collect,
          onLine: undefined,
        }),
      );
    });

    it("registers pre-tool in stream mode with callback when provided", () => {
      const { collector, addSource } = createMockCollector();
      const onPreToolUse = vi.fn();

      registry.registerAll(collector, profile, TASK_ID, WORK_ITEM_ID, { onPreToolUse }, cliPaths);

      expect(addSource).toHaveBeenCalledWith(
        expect.objectContaining({
          id: "pre-tool",
          mode: CaptureMode.Stream,
          onLine: onPreToolUse,
        }),
      );
    });

    it("registers tool-output in collect mode when no callback provided", () => {
      const { collector, addSource } = createMockCollector();

      registry.registerAll(collector, profile, TASK_ID, WORK_ITEM_ID, {}, cliPaths);

      expect(addSource).toHaveBeenCalledWith(
        expect.objectContaining({
          id: "tool-output",
          mode: CaptureMode.Collect,
          onLine: undefined,
        }),
      );
    });

    it("registers tool-output in stream mode with callback when provided", () => {
      const { collector, addSource } = createMockCollector();
      const onToolOutput = vi.fn();

      registry.registerAll(collector, profile, TASK_ID, WORK_ITEM_ID, { onToolOutput }, cliPaths);

      expect(addSource).toHaveBeenCalledWith(
        expect.objectContaining({
          id: "tool-output",
          mode: CaptureMode.Stream,
          onLine: onToolOutput,
        }),
      );
    });

    it("registers proxy source for egress-proxy service", () => {
      const { collector, addSource } = createMockCollector();

      registry.registerAll(collector, profile, TASK_ID, WORK_ITEM_ID, {}, cliPaths);

      expect(addSource).toHaveBeenCalledWith(
        expect.objectContaining({
          id: "proxy",
          service: "egress-proxy",
          containerPath: "/var/log/squid/access.log",
          mode: CaptureMode.Collect,
        }),
      );
    });

    it("registers sidecar source with useComposeLogs in stream mode", () => {
      const { collector, addSource } = createMockCollector();

      registry.registerAll(collector, profile, TASK_ID, WORK_ITEM_ID, {}, cliPaths);

      expect(addSource).toHaveBeenCalledWith(
        expect.objectContaining({
          id: "sidecar",
          service: "mcp-sidecar",
          useComposeLogs: true,
          mode: CaptureMode.Stream,
        }),
      );
    });

    it("registers cli-debug with glob collectArgs using cliPaths.logDir", () => {
      const { collector, addSource } = createMockCollector();

      registry.registerAll(collector, profile, TASK_ID, WORK_ITEM_ID, {}, cliPaths);

      expect(addSource).toHaveBeenCalledWith(
        expect.objectContaining({
          id: "cli-debug",
          collectArgs: ["sh", "-c", `cat ${cliPaths.logDir}/*.log 2>/dev/null`],
        }),
      );
    });

    it("registers state.md artifact from task workload directory", () => {
      const { collector, addSource } = createMockCollector();

      registry.registerAll(collector, profile, TASK_ID, WORK_ITEM_ID, {}, cliPaths);

      expect(addSource).toHaveBeenCalledWith(
        expect.objectContaining({
          id: "state",
          service: "app",
          containerPath: `/workspace/.ralph/tasks/${WORK_ITEM_ID}/state.md`,
          extension: "md",
          mode: CaptureMode.Collect,
        }),
      );
    });

    it("registers session-state folder export", () => {
      const { collector, addExport } = createMockCollector();

      registry.registerAll(collector, profile, TASK_ID, WORK_ITEM_ID, {}, cliPaths);

      expect(addExport).toHaveBeenCalledWith({
        id: "session-state",
        service: "app",
        containerPath: "/workspace/.ralph/session-state",
      });
    });

    it("registers artifacts folder export using workItemId, not taskId", () => {
      const { collector, addExport } = createMockCollector();

      registry.registerAll(collector, profile, TASK_ID, WORK_ITEM_ID, {}, cliPaths);

      expect(addExport).toHaveBeenCalledWith({
        id: "artifacts",
        service: "app",
        containerPath: `/workspace/.ralph/tasks/${WORK_ITEM_ID}/artifacts`,
      });
    });
  });
});
