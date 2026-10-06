/**
 * ContainerLogCollector behavior tests.
 *
 * Organized by observable behavior, not by method. The compose client is
 * mocked at the architectural boundary (Docker process execution). All
 * assertions focus on the files written to disk and the CollectedLog[]
 * returned — not on internal call sequences between the collector and
 * compose client.
 *
 * Exception: clearCollectSources sends truncation commands to the container
 * — there is no local output to check, so we assert on what was sent to
 * the boundary.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { mkdtempSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { CaptureMode, ContainerLogCollector } from "../../src/container/log-collector";
import type { IComposeClient } from "../../src/container/compose-client";
import { createMockCompose, createSilentLogger, fakeExecResult } from "../helpers/mocks";
import type { Logger } from "../../src/logger";

const SVC_APP = "app";
const SVC_SIDECAR = "mcp-sidecar";

let tempDir: string;
let logger: Logger;

function makeMockCompose(
  responses: Record<string, string> = {},
  logsResponse?: { stdout: string } | Error,
): IComposeClient {
  const { compose } = createMockCompose(async (args: string[]) => {
    const catIndex = args.indexOf("cat");
    if (catIndex >= 0) {
      const path = args[catIndex + 1];
      if (responses[path] !== undefined) {
        return { stdout: responses[path], stderr: "" };
      }
      throw new Error(`File not found: ${path}`);
    }

    const tailing = args.includes("tail");
    if (tailing) {
      return {
        stdout: { on: vi.fn() },
        stderr: { on: vi.fn() },
        kill: vi.fn(),
        catch: vi.fn().mockReturnThis(),
      };
    }

    throw new Error("Unexpected exec call");
  });

  if (logsResponse) {
    if (logsResponse instanceof Error) {
      vi.mocked(compose.logs).mockRejectedValue(logsResponse);
    } else {
      vi.mocked(compose.logs).mockResolvedValue(fakeExecResult({ stdout: logsResponse.stdout, stderr: "" }));
    }
  }

  return compose;
}

function createCollector(compose: IComposeClient): ContainerLogCollector {
  return new ContainerLogCollector({ compose, logDir: tempDir, logger });
}

beforeEach(() => {
  tempDir = mkdtempSync(join(tmpdir(), "log-collector-"));
  logger = createSilentLogger();
});

afterEach(() => {
  rmSync(tempDir, { recursive: true, force: true });
});

describe("ContainerLogCollector", () => {
  describe("collecting logs to disk", () => {
    it("writes container file content to the local output directory", async () => {
      const compose = makeMockCompose({
        "/var/log/squid/access.log": "1234 TCP_TUNNEL/200 proxy.example.com\n",
      });
      const collector = createCollector(compose);

      collector.setTaskId("DOC-100");
      collector.addSource({
        id: "proxy",
        service: "egress-proxy",
        containerPath: "/var/log/squid/access.log",
        extension: "log",
        mode: CaptureMode.Collect,
      });

      const results = await collector.collectAll();

      expect(results).toHaveLength(1);
      expect(results[0].id).toBe("proxy");
      const content = readFileSync(results[0].path!, "utf-8");
      expect(content).toContain("TCP_TUNNEL/200");
    });

    it("collects multiple sources from different services in one call", async () => {
      const compose = makeMockCompose({
        "/workspace/.ralph/logs/audit.jsonl": '{"action":"edit"}\n',
        "/workspace/.ralph/logs/session-transcript.md": "# Session\n\nAgent ran.",
        "/var/log/squid/access.log": "1234 TCP_DENIED/403 blocked.com\n",
      });
      const collector = createCollector(compose);

      collector.setTaskId("DOC-200");
      collector.addSource({
        id: "audit",
        service: SVC_APP,
        containerPath: "/workspace/.ralph/logs/audit.jsonl",
        extension: "jsonl",
        mode: CaptureMode.Collect,
      });
      collector.addSource({
        id: "transcript",
        service: SVC_APP,
        containerPath: "/workspace/.ralph/logs/session-transcript.md",
        extension: "md",
        mode: CaptureMode.Collect,
      });
      collector.addSource({
        id: "proxy",
        service: "egress-proxy",
        containerPath: "/var/log/squid/access.log",
        extension: "log",
        mode: CaptureMode.Collect,
      });

      const results = await collector.collectAll();

      expect(results).toHaveLength(3);
      expect(readFileSync(results.find((r) => r.id === "audit")!.path!, "utf-8")).toContain("edit");
      expect(readFileSync(results.find((r) => r.id === "transcript")!.path!, "utf-8")).toContain("Session");
      expect(readFileSync(results.find((r) => r.id === "proxy")!.path!, "utf-8")).toContain("TCP_DENIED");
    });

    it("collects via compose logs when useComposeLogs is set", async () => {
      const compose = makeMockCompose({}, { stdout: "[gateway] Starting 2 MCP server(s)\n" });
      const collector = createCollector(compose);

      collector.setTaskId("DOC-1000");
      collector.addSource({
        id: "sidecar",
        service: SVC_SIDECAR,
        containerPath: "",
        extension: "log",
        mode: CaptureMode.Collect,
        useComposeLogs: true,
      });

      const results = await collector.collectAll();

      expect(results[0].path).toBeTruthy();
      const content = readFileSync(results[0].path!, "utf-8");
      expect(content).toContain("gateway");
    });

    it("collects both compose-logs and file-based sources in one pass", async () => {
      const compose = makeMockCompose(
        { "/var/log/squid/access.log": "TCP_TUNNEL/200 proxy.example.com\n" },
        { stdout: "[gateway] sidecar output\n" },
      );
      const collector = createCollector(compose);

      collector.setTaskId("DOC-1100");
      collector.addSource({
        id: "proxy",
        service: "egress-proxy",
        containerPath: "/var/log/squid/access.log",
        extension: "log",
        mode: CaptureMode.Collect,
      });
      collector.addSource({
        id: "sidecar",
        service: SVC_SIDECAR,
        containerPath: "",
        extension: "log",
        mode: CaptureMode.Collect,
        useComposeLogs: true,
      });

      const results = await collector.collectAll();

      expect(results).toHaveLength(2);
      expect(readFileSync(results[0].path!, "utf-8")).toContain("TCP_TUNNEL/200");
      expect(readFileSync(results[1].path!, "utf-8")).toContain("sidecar output");
    });
  });

  describe("handling missing or empty sources", () => {
    it("returns null path when the container file content is blank", async () => {
      const compose = makeMockCompose({
        "/var/log/squid/access.log": "   \n  ",
      });
      const collector = createCollector(compose);

      collector.setTaskId("DOC-300");
      collector.addSource({
        id: "proxy",
        service: "egress-proxy",
        containerPath: "/var/log/squid/access.log",
        extension: "log",
        mode: CaptureMode.Collect,
      });

      const results = await collector.collectAll();

      expect(results[0].path).toBeNull();
    });

    it("returns null path when the container file does not exist", async () => {
      const compose = makeMockCompose({});
      const collector = createCollector(compose);

      collector.setTaskId("DOC-400");
      collector.addSource({
        id: "audit",
        service: SVC_APP,
        containerPath: "/nonexistent/path.jsonl",
        extension: "jsonl",
        mode: CaptureMode.Collect,
      });

      const results = await collector.collectAll();

      expect(results[0].path).toBeNull();
    });

    it("returns null path when compose logs yields blank output", async () => {
      const compose = makeMockCompose({}, { stdout: "  \n  " });
      const collector = createCollector(compose);

      collector.setTaskId("DOC-1200");
      collector.addSource({
        id: "sidecar",
        service: SVC_SIDECAR,
        containerPath: "",
        extension: "log",
        mode: CaptureMode.Collect,
        useComposeLogs: true,
      });

      const results = await collector.collectAll();

      expect(results[0].path).toBeNull();
    });

    it("returns null path when compose logs throws", async () => {
      const compose = makeMockCompose({}, new Error("container not running"));
      const collector = createCollector(compose);

      collector.setTaskId("DOC-1300");
      collector.addSource({
        id: "sidecar",
        service: SVC_SIDECAR,
        containerPath: "",
        extension: "log",
        mode: CaptureMode.Collect,
        useComposeLogs: true,
      });

      const results = await collector.collectAll();

      expect(results[0].path).toBeNull();
    });

    it("only writes files for sources that have content", async () => {
      const compose = makeMockCompose({
        "/path/exists.log": "real data",
      });
      const collector = createCollector(compose);

      collector.setTaskId("DOC-800");
      collector.addSource({
        id: "exists",
        service: SVC_APP,
        containerPath: "/path/exists.log",
        extension: "log",
        mode: CaptureMode.Collect,
      });
      collector.addSource({
        id: "missing",
        service: SVC_APP,
        containerPath: "/path/missing.log",
        extension: "log",
        mode: CaptureMode.Collect,
      });

      const results = await collector.collectAll();
      const files = readdirSync(join(tempDir, "DOC-800"));

      expect(results[0].path).toBeTruthy();
      expect(results[1].path).toBeNull();
      expect(files).toHaveLength(1);
    });

    it("still collects proxy logs when app-side sources are missing", async () => {
      const compose = makeMockCompose({
        "/var/log/squid/access.log": "1234 TCP_DENIED/403 aka.ms\n",
      });
      const collector = createCollector(compose);

      collector.setTaskId("DOC-900");
      collector.addSource({
        id: "audit",
        service: SVC_APP,
        containerPath: "/workspace/.ralph/logs/session.audit.jsonl",
        extension: "jsonl",
        mode: CaptureMode.Collect,
      });
      collector.addSource({
        id: "proxy",
        service: "egress-proxy",
        containerPath: "/var/log/squid/access.log",
        extension: "log",
        mode: CaptureMode.Collect,
      });

      const results = await collector.collectAll();

      expect(results.find((r) => r.id === "proxy")?.path).toBeTruthy();
      expect(results.find((r) => r.id === "audit")?.path).toBeNull();
    });
  });

  describe("filename conventions", () => {
    it("names files as taskId-timestamp-sourceId.extension", async () => {
      const compose = makeMockCompose({
        "/workspace/.ralph/logs/audit.jsonl": '{"action":"edit"}\n',
        "/var/log/squid/access.log": "proxy data",
      });
      const collector = createCollector(compose);

      collector.setTaskId("DOC-200");
      collector.addSource({
        id: "audit",
        service: SVC_APP,
        containerPath: "/workspace/.ralph/logs/audit.jsonl",
        extension: "jsonl",
        mode: CaptureMode.Collect,
      });
      collector.addSource({
        id: "proxy",
        service: "egress-proxy",
        containerPath: "/var/log/squid/access.log",
        extension: "log",
        mode: CaptureMode.Collect,
      });

      const results = await collector.collectAll();

      expect(results[0].path).toMatch(/DOC-200-\d+-audit\.jsonl$/);
      expect(results[1].path).toMatch(/DOC-200-\d+-proxy\.log$/);
    });

    it("uses the same timestamp for all sources in one collection pass", async () => {
      const compose = makeMockCompose({
        "/path/a.log": "content a",
        "/path/b.log": "content b",
      });
      const collector = createCollector(compose);

      collector.setTaskId("DOC-500");
      collector.addSource({
        id: "a",
        service: SVC_APP,
        containerPath: "/path/a.log",
        extension: "log",
        mode: CaptureMode.Collect,
      });
      collector.addSource({
        id: "b",
        service: SVC_APP,
        containerPath: "/path/b.log",
        extension: "log",
        mode: CaptureMode.Collect,
      });

      const results = await collector.collectAll();

      const tsA = results[0].path!.match(/DOC-500-(\d+)-a/)![1];
      const tsB = results[1].path!.match(/DOC-500-(\d+)-b/)![1];
      expect(tsA).toBe(tsB);
    });

    it("inserts the stage label between timestamp and source ID", async () => {
      const compose = makeMockCompose({
        "/workspace/.ralph/logs/audit.jsonl": '{"action":"edit"}\n',
        "/var/log/squid/access.log": "proxy data",
      });
      const collector = createCollector(compose);

      collector.setTaskId("DOC-1400");
      collector.addSource({
        id: "audit",
        service: SVC_APP,
        containerPath: "/workspace/.ralph/logs/audit.jsonl",
        extension: "jsonl",
        mode: CaptureMode.Collect,
      });
      collector.addSource({
        id: "proxy",
        service: "egress-proxy",
        containerPath: "/var/log/squid/access.log",
        extension: "log",
        mode: CaptureMode.Collect,
      });

      const results = await collector.collectAll("researcher");

      expect(results[0].path).toMatch(/DOC-1400-\d+-researcher-audit\.jsonl$/);
      expect(results[1].path).toMatch(/DOC-1400-\d+-researcher-proxy\.log$/);
    });

    it("omits stage label segment when none is provided", async () => {
      const compose = makeMockCompose({ "/path/a.log": "content" });
      const collector = createCollector(compose);

      collector.setTaskId("DOC-1500");
      collector.addSource({
        id: "source-a",
        service: SVC_APP,
        containerPath: "/path/a.log",
        extension: "log",
        mode: CaptureMode.Collect,
      });

      const results = await collector.collectAll();

      expect(results[0].path).toMatch(/DOC-1500-\d+-source-a\.log$/);
    });

    it("includes stage label in folder export paths", async () => {
      const { compose } = createMockCompose();
      const collector = createCollector(compose);

      collector.setTaskId("DOC-1600");
      collector.addExport({
        id: "session-state",
        service: SVC_APP,
        containerPath: "/workspace/.ralph/session-state",
      });

      await collector.collectAll("writer");

      const cpCall = vi.mocked(compose.compose).mock.calls[0][0];
      const localPath = cpCall[cpCall.length - 1];
      expect(localPath).toMatch(/DOC-1600-\d+-writer-session-state$/);
    });
  });

  describe("clearing sources between pipeline stages", () => {
    it("sends truncation commands for file-based collect sources", async () => {
      const { compose } = createMockCompose();
      const collector = createCollector(compose);

      collector.addSource({
        id: "audit",
        service: SVC_APP,
        containerPath: "/workspace/.ralph/logs/audit.jsonl",
        extension: "jsonl",
        mode: CaptureMode.Collect,
      });
      collector.addSource({
        id: "proxy",
        service: "egress-proxy",
        containerPath: "/var/log/squid/access.log",
        extension: "log",
        mode: CaptureMode.Collect,
      });

      await collector.clearCollectSources();

      expect(compose.exec).toHaveBeenCalledWith([
        "-T",
        SVC_APP,
        "sh",
        "-c",
        "truncate -s 0 /workspace/.ralph/logs/audit.jsonl 2>/dev/null || true",
      ]);
      expect(compose.exec).toHaveBeenCalledWith([
        "-T",
        "egress-proxy",
        "sh",
        "-c",
        "truncate -s 0 /var/log/squid/access.log 2>/dev/null || true",
      ]);
    });

    it("skips compose-logs and custom-collectArgs sources", async () => {
      const { compose } = createMockCompose();
      const collector = createCollector(compose);

      collector.addSource({
        id: "sidecar",
        service: SVC_SIDECAR,
        containerPath: "",
        extension: "log",
        mode: CaptureMode.Collect,
        useComposeLogs: true,
      });
      collector.addSource({
        id: "cli-debug",
        service: SVC_APP,
        containerPath: "/workspace/.ralph/logs/cli-debug",
        extension: "log",
        mode: CaptureMode.Collect,
        collectArgs: ["sh", "-c", "cat /workspace/.ralph/logs/cli-debug/*.log 2>/dev/null"],
      });

      await collector.clearCollectSources();

      expect(compose.exec).not.toHaveBeenCalled();
    });

    it("handles truncation failures without throwing", async () => {
      const { compose } = createMockCompose();
      vi.mocked(compose.exec).mockRejectedValue(new Error("container not running"));
      const collector = createCollector(compose);

      collector.addSource({
        id: "audit",
        service: SVC_APP,
        containerPath: "/workspace/.ralph/logs/audit.jsonl",
        extension: "jsonl",
        mode: CaptureMode.Collect,
      });

      await expect(collector.clearCollectSources()).resolves.toBeUndefined();
    });
  });

  describe("edge cases", () => {
    it("throws when collecting without setting a task ID", async () => {
      const compose = makeMockCompose({});
      const collector = createCollector(compose);

      collector.addSource({
        id: "proxy",
        service: "egress-proxy",
        containerPath: "/var/log/squid/access.log",
        extension: "log",
        mode: CaptureMode.Collect,
      });

      await expect(collector.collectAll()).rejects.toThrow("Task ID not set");
    });

    it("returns empty array when no sources are registered", async () => {
      const compose = makeMockCompose({});
      const collector = createCollector(compose);
      collector.setTaskId("DOC-700");

      const results = await collector.collectAll();

      expect(results).toEqual([]);
    });

    it("detach is safe to call when nothing is streaming", () => {
      const compose = makeMockCompose({});
      const collector = createCollector(compose);

      expect(() => collector.detach()).not.toThrow();
    });
  });
});
