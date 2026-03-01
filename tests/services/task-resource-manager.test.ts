import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { TaskResourceManager } from "../../src/services/task-resource-manager.js";
import { makeWorkItemComment } from "../helpers/factories.js";
import { createMockConnector, createMockLogger } from "../helpers/mocks.js";
import type { IDataSourceConnector } from "../../src/datasource/connector.js";

const DS = "mock";
const KEY = "DF-100";

vi.mock("node:fs", async (importOriginal) => {
  const orig = await importOriginal<typeof import("node:fs")>();
  return { ...orig, readFileSync: vi.fn().mockReturnValue("transcript content") };
});

describe("TaskResourceManager", () => {
  let connector: ReturnType<typeof createMockConnector>;
  let logger: ReturnType<typeof createMockLogger>;
  let resources: TaskResourceManager;

  beforeEach(() => {
    connector = createMockConnector();
    logger = createMockLogger();
    resources = new TaskResourceManager({ connectors: new Map<string, IDataSourceConnector>([[DS, connector]]), logger });
    resources.retryOptions = { delayMs: 1 };
  });

  describe("fetchComments", () => {
    it("formats comments with timestamp and author", async () => {
      connector.getComments.mockResolvedValue([
        makeWorkItemComment("1", "First comment", "2026-01-15T10:00:00Z"),
        makeWorkItemComment("2", "Second comment", "2026-01-15T11:00:00Z"),
      ]);

      const result = await resources.fetchComments(DS, KEY);

      expect(result).toHaveLength(2);
      expect(result[0]).toBe("[2026-01-15T10:00:00Z] Test User:\nFirst comment");
      expect(result[1]).toBe("[2026-01-15T11:00:00Z] Test User:\nSecond comment");
    });

    it("returns plain-text comment body directly", async () => {
      connector.getComments.mockResolvedValue([
        makeWorkItemComment("1", "Plain text content", "2026-01-15T10:00:00Z"),
      ]);

      const result = await resources.fetchComments(DS, KEY);

      expect(result[0]).toContain("Plain text content");
    });

    it("returns empty array when getComments fails", async () => {
      connector.getComments.mockRejectedValue(new Error("Connector down"));

      const result = await resources.fetchComments(DS, KEY);

      expect(result).toEqual([]);
      expect(logger.warn).toHaveBeenCalledWith(
        expect.stringContaining("Failed to fetch comments"),
      );
    });
  });

  describe("fetchHandoff", () => {
    it("returns content of the most recent handoff.md", async () => {
      connector.getAttachments.mockResolvedValue([
        { id: "1", filename: "handoff.md", created: "2026-01-10T00:00:00Z" },
        { id: "2", filename: "handoff.md", created: "2026-01-15T00:00:00Z" },
      ]);
      connector.downloadAttachment.mockResolvedValue("# Handoff v2");

      const result = await resources.fetchHandoff(DS, KEY);

      expect(result).toBe("# Handoff v2");
      expect(connector.downloadAttachment).toHaveBeenCalledWith(KEY, "2");
    });

    it("matches handoff-<id>.md filenames", async () => {
      connector.getAttachments.mockResolvedValue([
        { id: "1", filename: "handoff-DOC-3143.md", created: "2026-01-10T00:00:00Z" },
        { id: "2", filename: "other.txt", created: "2026-01-15T00:00:00Z" },
      ]);
      connector.downloadAttachment.mockResolvedValue("# Handoff DOC-3143");

      const result = await resources.fetchHandoff(DS, KEY);

      expect(result).toBe("# Handoff DOC-3143");
      expect(connector.downloadAttachment).toHaveBeenCalledWith(KEY, "1");
    });

    it("returns null when no handoff.md exists", async () => {
      connector.getAttachments.mockResolvedValue([
        { id: "1", filename: "other.txt", created: "2026-01-10T00:00:00Z" },
      ]);

      const result = await resources.fetchHandoff(DS, KEY);

      expect(result).toBeNull();
      expect(connector.downloadAttachment).not.toHaveBeenCalled();
    });

    it("returns null when getAttachments fails", async () => {
      connector.getAttachments.mockRejectedValue(new Error("Network error"));

      const result = await resources.fetchHandoff(DS, KEY);

      expect(result).toBeNull();
      expect(logger.warn).toHaveBeenCalledWith(
        expect.stringContaining("Failed to fetch attachments"),
      );
    });

    it("returns null when download fails", async () => {
      connector.getAttachments.mockResolvedValue([
        { id: "1", filename: "handoff.md", created: "2026-01-10T00:00:00Z" },
      ]);
      connector.downloadAttachment.mockRejectedValue(new Error("403 Forbidden"));

      const result = await resources.fetchHandoff(DS, KEY);

      expect(result).toBeNull();
      expect(logger.warn).toHaveBeenCalledWith(
        expect.stringContaining("Failed to download handoff"),
      );
    });
  });

  describe("attachTranscript", () => {
    afterEach(() => {
      vi.useRealTimers();
    });

    it("reads file and attaches with formatted filename", async () => {
      const { readFileSync } = await import("node:fs");
      vi.mocked(readFileSync).mockReturnValue("transcript content");
      vi.useFakeTimers({ now: new Date("2026-03-15T12:00:00Z") });

      await resources.attachTranscript(DS, KEY, "/tmp/transcript.md", "ralph");

      expect(connector.addAttachment).toHaveBeenCalledWith(
        KEY,
        "session-transcript-ralph-15-03-2026.md",
        "transcript content",
      );
      expect(logger.info).toHaveBeenCalledWith(
        expect.stringContaining("Session transcript attached"),
      );
    });

    it("logs warning when attachment fails", async () => {
      const { readFileSync } = await import("node:fs");
      vi.mocked(readFileSync).mockReturnValue("content");
      connector.addAttachment.mockRejectedValue(new Error("Upload failed"));

      await resources.attachTranscript(DS, KEY, "/tmp/transcript.md", "ralph");

      expect(logger.warn).toHaveBeenCalledWith(
        expect.stringContaining("Failed to attach transcript"),
      );
    });

    it("logs warning when file read fails", async () => {
      const { readFileSync } = await import("node:fs");
      vi.mocked(readFileSync).mockImplementation(() => { throw new Error("ENOENT"); });

      await resources.attachTranscript(DS, KEY, "/tmp/missing.md", "ralph");

      expect(logger.warn).toHaveBeenCalledWith(
        expect.stringContaining("Failed to attach transcript"),
      );
    });
  });
});
