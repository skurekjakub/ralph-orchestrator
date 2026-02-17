import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { mkdirSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import { CaptureMode, ContainerLogCollector } from "../src/container/log-collector.js";
import type { ComposeClient } from "../src/container/compose-client.js";
import type { Logger } from "../src/logger.js";

const tempDir = join(import.meta.dirname, ".tmp-log-collector");

function makeMockLogger(): Logger {
  return {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  };
}

function makeMockCompose(responses: Record<string, string> = {}): ComposeClient {
  return {
    exec: vi.fn().mockImplementation(async (args: string[]) => {
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
        const mockProc = {
          stdout: { on: vi.fn() },
          stderr: { on: vi.fn() },
          kill: vi.fn(),
          catch: vi.fn().mockReturnThis(),
        };
        return mockProc;
      }

      throw new Error("Unexpected exec call");
    }),
  } as any;
}

describe("ContainerLogCollector", () => {
  beforeEach(() => {
    mkdirSync(tempDir, { recursive: true });
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  it("collects a single source to disk", async () => {
    const compose = makeMockCompose({
      "/var/log/squid/access.log": "1234 TCP_TUNNEL/200 proxy.example.com\n",
    });
    const logger = makeMockLogger();
    const collector = new ContainerLogCollector(compose, tempDir, logger);

    collector.setIssueKey("DOC-100");
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
    const logger = makeMockLogger();
    const collector = new ContainerLogCollector(compose, tempDir, logger);

    collector.setIssueKey("DOC-200");
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
    const logger = makeMockLogger();
    const collector = new ContainerLogCollector(compose, tempDir, logger);

    collector.setIssueKey("DOC-300");
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
    const logger = makeMockLogger();
    const collector = new ContainerLogCollector(compose, tempDir, logger);

    collector.setIssueKey("DOC-400");
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
    const logger = makeMockLogger();
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
    const logger = makeMockLogger();
    const collector = new ContainerLogCollector(compose, tempDir, logger);

    collector.setIssueKey("DOC-500");
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
    const logger = makeMockLogger();
    const collector = new ContainerLogCollector(compose, tempDir, logger);

    collector.setIssueKey("DOC-600");
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

    const execCalls = (compose.exec as any).mock.calls;
    expect(execCalls[0]).toEqual([
      ["-T", "app", "cat", "/workspace/.ralph/logs/audit.jsonl"],
    ]);
    expect(execCalls[1]).toEqual([
      ["-T", "egress-proxy", "cat", "/var/log/squid/access.log"],
    ]);
  });

  it("detach is safe to call when nothing is streaming", () => {
    const compose = makeMockCompose({});
    const logger = makeMockLogger();
    const collector = new ContainerLogCollector(compose, tempDir, logger);

    // Should not throw
    collector.detach();
  });

  it("collectAll returns empty array when no sources registered", async () => {
    const compose = makeMockCompose({});
    const logger = makeMockLogger();
    const collector = new ContainerLogCollector(compose, tempDir, logger);
    collector.setIssueKey("DOC-700");

    const results = await collector.collectAll();

    expect(results).toEqual([]);
  });

  it("does not write files for null results", async () => {
    const compose = makeMockCompose({
      "/path/exists.log": "real data",
    });
    const logger = makeMockLogger();
    const collector = new ContainerLogCollector(compose, tempDir, logger);

    collector.setIssueKey("DOC-800");
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
    const files = readdirSync(tempDir);

    expect(results[0].path).toBeTruthy();
    expect(results[1].path).toBeNull();
    expect(files).toHaveLength(1);
    expect(files[0]).toContain("exists");
  });
});
