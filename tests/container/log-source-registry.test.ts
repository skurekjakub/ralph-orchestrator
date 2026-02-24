import { describe, it, expect, vi } from "vitest";
import { LogSourceRegistry } from "../../src/container/log-source-registry.js";
import { CaptureMode } from "../../src/container/log-collector.js";
import type { IContainerLogCollector } from "../../src/container/log-collector.js";
import type { CliPaths } from "../../src/container/types.js";
import { makeProfile } from "../helpers/factories.js";

function createMockCollector(): {
  collector: IContainerLogCollector;
  setTaskId: ReturnType<typeof vi.fn>;
  addSource: ReturnType<typeof vi.fn>;
  attach: ReturnType<typeof vi.fn>;
} {
  const setTaskId = vi.fn();
  const addSource = vi.fn();
  const attach = vi.fn();
  const collector: IContainerLogCollector = { setTaskId, addSource, attach, detach: vi.fn(), collectAll: vi.fn() };
  return { collector, setTaskId, addSource, attach };
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

      registry.registerAll(collector, profile, "DF-100", {}, cliPaths);

      expect(setTaskId).toHaveBeenCalledWith("DF-100");
    });

    it("registers all 7 standard log sources", () => {
      const { collector, addSource } = createMockCollector();

      registry.registerAll(collector, profile, "DF-100", {}, cliPaths);

      expect(addSource).toHaveBeenCalledTimes(7);
      const ids = addSource.mock.calls.map((call: unknown[]) => (call[0] as { id: string }).id);
      expect(ids).toEqual(["audit", "transcript", "pre-tool", "tool-output", "proxy", "cli-debug", "sidecar"]);
    });

    it("calls attach after registering sources", () => {
      const { collector, addSource, attach } = createMockCollector();

      registry.registerAll(collector, profile, "DF-100", {}, cliPaths);

      // attach must be called after all addSource calls
      const addSourceOrder = addSource.mock.invocationCallOrder;
      const attachOrder = attach.mock.invocationCallOrder;
      expect(attachOrder[0]).toBeGreaterThan(addSourceOrder[addSourceOrder.length - 1]);
    });

    it("registers audit source with profile auditLogPath", () => {
      const { collector, addSource } = createMockCollector();

      registry.registerAll(collector, profile, "DF-100", {}, cliPaths);

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

      registry.registerAll(collector, profile, "DF-100", {}, cliPaths);

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

      registry.registerAll(collector, profile, "DF-100", {}, cliPaths);

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

      registry.registerAll(collector, profile, "DF-100", { onPreToolUse }, cliPaths);

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

      registry.registerAll(collector, profile, "DF-100", {}, cliPaths);

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

      registry.registerAll(collector, profile, "DF-100", { onToolOutput }, cliPaths);

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

      registry.registerAll(collector, profile, "DF-100", {}, cliPaths);

      expect(addSource).toHaveBeenCalledWith(
        expect.objectContaining({
          id: "proxy",
          service: "egress-proxy",
          containerPath: "/var/log/squid/access.log",
          mode: CaptureMode.Collect,
        }),
      );
    });

    it("registers sidecar source with useComposeLogs", () => {
      const { collector, addSource } = createMockCollector();

      registry.registerAll(collector, profile, "DF-100", {}, cliPaths);

      expect(addSource).toHaveBeenCalledWith(
        expect.objectContaining({
          id: "sidecar",
          service: "mcp-sidecar",
          useComposeLogs: true,
          mode: CaptureMode.Collect,
        }),
      );
    });

    it("registers cli-debug with glob collectArgs using cliPaths.logDir", () => {
      const { collector, addSource } = createMockCollector();

      registry.registerAll(collector, profile, "DF-100", {}, cliPaths);

      expect(addSource).toHaveBeenCalledWith(
        expect.objectContaining({
          id: "cli-debug",
          collectArgs: ["sh", "-c", `cat ${cliPaths.logDir}/*.log 2>/dev/null`],
        }),
      );
    });
  });
});
