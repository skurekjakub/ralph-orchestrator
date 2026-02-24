import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { mkdtempSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { CaptureMode, ContainerLogCollector } from "../../src/container/log-collector.js";
import type { IComposeClient } from "../../src/container/compose-client.js";
import { createMockCompose, createMockLogger, fakeExecResult } from "../helpers/mocks.js";

let tempDir: string;

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

    // For tail -f: return a mock process with stdout
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

describe("ContainerLogCollector", () => {
  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), "log-collector-"));
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  it("collects a single source to disk", async () => {
    const compose = makeMockCompose({
      "/var/log/squid/access.log": "1234 TCP_TUNNEL/200 proxy.example.com\n",
    });
    const logger = createMockLogger();
    const collector = new ContainerLogCollector(compose, tempDir, logger);

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
    expect(results[0].path).toBeTruthy();

    const content = readFileSync(results[0].path!, "utf-8");
    expect(content).toContain("TCP_TUNNEL/200");
  });

  it("collects multiple sources in one call", async () => {
    const compose = makeMockCompose({
      "/workspace/.ralph/logs/audit.jsonl": '{"action":"edit"}\n',
      "/workspace/.ralph/logs/session-transcript.md": "# Session\n\nAgent ran.",
      "/var/log/squid/access.log": "1234 TCP_DENIED/403 blocked.com\n",
    });
    const logger = createMockLogger();
    const collector = new ContainerLogCollector(compose, tempDir, logger);

    collector.setTaskId("DOC-200");
    collector.addSource({
      id: "audit",
      service: "app",
      containerPath: "/workspace/.ralph/logs/audit.jsonl",
      extension: "jsonl",
      mode: CaptureMode.Collect,
    });
    collector.addSource({
      id: "transcript",
      service: "app",
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

    const audit = results.find((r) => r.id === "audit")!;
    const transcript = results.find((r) => r.id === "transcript")!;
    const proxy = results.find((r) => r.id === "proxy")!;

    expect(audit.path).toMatch(/DOC-200-\d+-audit\.jsonl$/);
    expect(transcript.path).toMatch(/DOC-200-\d+-transcript\.md$/);
    expect(proxy.path).toMatch(/DOC-200-\d+-proxy\.log$/);

    expect(readFileSync(audit.path!, "utf-8")).toContain("edit");
    expect(readFileSync(transcript.path!, "utf-8")).toContain("Session");
    expect(readFileSync(proxy.path!, "utf-8")).toContain("TCP_DENIED");
  });

  it("returns null path for empty content", async () => {
    const compose = makeMockCompose({
      "/var/log/squid/access.log": "   \n  ",
    });
    const logger = createMockLogger();
    const collector = new ContainerLogCollector(compose, tempDir, logger);

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
    expect(logger.warn).toHaveBeenCalledWith("No proxy log found");
  });

  it("returns null path when container file does not exist", async () => {
    const compose = makeMockCompose({});
    const logger = createMockLogger();
    const collector = new ContainerLogCollector(compose, tempDir, logger);

    collector.setTaskId("DOC-400");
    collector.addSource({
      id: "audit",
      service: "app",
      containerPath: "/nonexistent/path.jsonl",
      extension: "jsonl",
      mode: CaptureMode.Collect,
    });

    const results = await collector.collectAll();

    expect(results[0].path).toBeNull();
    expect(logger.warn).toHaveBeenCalledWith("Failed to collect audit log");
  });

  it("throws when collectAll is called without setting issue key", async () => {
    const compose = makeMockCompose({});
    const logger = createMockLogger();
    const collector = new ContainerLogCollector(compose, tempDir, logger);

    collector.addSource({
      id: "proxy",
      service: "egress-proxy",
      containerPath: "/var/log/squid/access.log",
      extension: "log",
      mode: CaptureMode.Collect,
    });

    await expect(collector.collectAll()).rejects.toThrow("Issue key not set");
  });

  it("uses consistent timestamp across all sources in one collectAll call", async () => {
    const compose = makeMockCompose({
      "/path/a.log": "content a",
      "/path/b.log": "content b",
    });
    const logger = createMockLogger();
    const collector = new ContainerLogCollector(compose, tempDir, logger);

    collector.setTaskId("DOC-500");
    collector.addSource({
      id: "source-a",
      service: "app",
      containerPath: "/path/a.log",
      extension: "log",
      mode: CaptureMode.Collect,
    });
    collector.addSource({
      id: "source-b",
      service: "app",
      containerPath: "/path/b.log",
      extension: "log",
      mode: CaptureMode.Collect,
    });

    const results = await collector.collectAll();

    // Extract timestamps from filenames
    const tsA = results[0].path!.match(/DOC-500-(\d+)-source-a/)![1];
    const tsB = results[1].path!.match(/DOC-500-(\d+)-source-b/)![1];
    expect(tsA).toBe(tsB);
  });

  it("exec targets the correct service per source", async () => {
    const compose = makeMockCompose({
      "/workspace/.ralph/logs/audit.jsonl": "audit data",
      "/var/log/squid/access.log": "proxy data",
    });
    const logger = createMockLogger();
    const collector = new ContainerLogCollector(compose, tempDir, logger);

    collector.setTaskId("DOC-600");
    collector.addSource({
      id: "audit",
      service: "app",
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

    await collector.collectAll();

    const execCalls = vi.mocked(compose.exec).mock.calls;
    expect(execCalls[0]).toEqual([
      ["-T", "app", "cat", "/workspace/.ralph/logs/audit.jsonl"],
    ]);
    expect(execCalls[1]).toEqual([
      ["-T", "egress-proxy", "cat", "/var/log/squid/access.log"],
    ]);
  });

  it("detach is safe to call when nothing is streaming", () => {
    const compose = makeMockCompose({});
    const logger = createMockLogger();
    const collector = new ContainerLogCollector(compose, tempDir, logger);

    // Should not throw
    collector.detach();
  });

  it("collectAll returns empty array when no sources registered", async () => {
    const compose = makeMockCompose({});
    const logger = createMockLogger();
    const collector = new ContainerLogCollector(compose, tempDir, logger);
    collector.setTaskId("DOC-700");

    const results = await collector.collectAll();

    expect(results).toEqual([]);
  });

  it("does not write files for null results", async () => {
    const compose = makeMockCompose({
      "/path/exists.log": "real data",
    });
    const logger = createMockLogger();
    const collector = new ContainerLogCollector(compose, tempDir, logger);

    collector.setTaskId("DOC-800");
    collector.addSource({
      id: "exists",
      service: "app",
      containerPath: "/path/exists.log",
      extension: "log",
      mode: CaptureMode.Collect,
    });
    collector.addSource({
      id: "missing",
      service: "app",
      containerPath: "/path/missing.log",
      extension: "log",
      mode: CaptureMode.Collect,
    });

    const results = await collector.collectAll();
    const issueDir = join(tempDir, "DOC-800");
    const files = readdirSync(issueDir);

    expect(results[0].path).toBeTruthy();
    expect(results[1].path).toBeNull();
    expect(files).toHaveLength(1);
    expect(files[0]).toContain("exists");
  });

  it("collects proxy logs even when app-side sources are missing (setup failure scenario)", async () => {
    const compose = makeMockCompose({
      "/var/log/squid/access.log": "1234 TCP_DENIED/403 aka.ms\n1235 TCP_DENIED/403 pypi.org\n",
    });
    const logger = createMockLogger();
    const collector = new ContainerLogCollector(compose, tempDir, logger);

    collector.setTaskId("DOC-900");

    collector.addSource({
      id: "audit",
      service: "app",
      containerPath: "/workspace/.ralph/logs/session.audit.jsonl",
      extension: "jsonl",
      mode: CaptureMode.Collect,
    });
    collector.addSource({
      id: "transcript",
      service: "app",
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

    const proxyResult = results.find((r) => r.id === "proxy");
    expect(proxyResult?.path).toBeTruthy();
    const content = readFileSync(proxyResult!.path!, "utf-8");
    expect(content).toContain("TCP_DENIED/403");

    expect(results.find((r) => r.id === "audit")?.path).toBeNull();
    expect(results.find((r) => r.id === "transcript")?.path).toBeNull();
  });

  it("uses compose.logs() instead of exec when useComposeLogs is set", async () => {
    const compose = makeMockCompose({}, { stdout: "[gateway] Starting 2 MCP server(s)\n" });
    const logger = createMockLogger();
    const collector = new ContainerLogCollector(compose, tempDir, logger);

    collector.setTaskId("DOC-1000");
    collector.addSource({
      id: "sidecar",
      service: "mcp-sidecar",
      containerPath: "",
      extension: "log",
      mode: CaptureMode.Collect,
      useComposeLogs: true,
    });

    const results = await collector.collectAll();

    expect(compose.logs).toHaveBeenCalledWith("mcp-sidecar");
    expect(compose.exec).not.toHaveBeenCalled();
    expect(results[0].path).toBeTruthy();
    const content = readFileSync(results[0].path!, "utf-8");
    expect(content).toContain("gateway");
  });

  it("collects mixed useComposeLogs and exec sources in one pass", async () => {
    const compose = makeMockCompose(
      { "/var/log/squid/access.log": "TCP_TUNNEL/200 proxy.example.com\n" },
      { stdout: "[gateway] sidecar output\n" },
    );
    const logger = createMockLogger();
    const collector = new ContainerLogCollector(compose, tempDir, logger);

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
      service: "mcp-sidecar",
      containerPath: "",
      extension: "log",
      mode: CaptureMode.Collect,
      useComposeLogs: true,
    });

    const results = await collector.collectAll();

    expect(results).toHaveLength(2);
    expect(compose.exec).toHaveBeenCalledTimes(1);
    expect(compose.logs).toHaveBeenCalledWith("mcp-sidecar");

    expect(readFileSync(results[0].path!, "utf-8")).toContain("TCP_TUNNEL/200");
    expect(readFileSync(results[1].path!, "utf-8")).toContain("sidecar output");
  });

  it("returns null when useComposeLogs yields empty stdout", async () => {
    const compose = makeMockCompose({}, { stdout: "  \n  " });
    const logger = createMockLogger();
    const collector = new ContainerLogCollector(compose, tempDir, logger);

    collector.setTaskId("DOC-1200");
    collector.addSource({
      id: "sidecar",
      service: "mcp-sidecar",
      containerPath: "",
      extension: "log",
      mode: CaptureMode.Collect,
      useComposeLogs: true,
    });

    const results = await collector.collectAll();

    expect(results[0].path).toBeNull();
    expect(logger.warn).toHaveBeenCalledWith("No sidecar log found");
  });

  it("returns null when useComposeLogs throws", async () => {
    const compose = makeMockCompose({}, new Error("container not running"));
    const logger = createMockLogger();
    const collector = new ContainerLogCollector(compose, tempDir, logger);

    collector.setTaskId("DOC-1300");
    collector.addSource({
      id: "sidecar",
      service: "mcp-sidecar",
      containerPath: "",
      extension: "log",
      mode: CaptureMode.Collect,
      useComposeLogs: true,
    });

    const results = await collector.collectAll();

    expect(results[0].path).toBeNull();
    expect(logger.warn).toHaveBeenCalledWith("Failed to collect sidecar log");
  });
});
