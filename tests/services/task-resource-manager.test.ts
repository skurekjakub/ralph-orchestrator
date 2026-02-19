import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { TaskJiraResourceManager } from "../../src/services/task-resource-manager.js";
import { makeComment } from "../helpers/factories.js";
import { createMockJiraClient, createMockLogger } from "../helpers/mocks.js";

vi.mock("node:fs", async (importOriginal) => {
  const orig = await importOriginal<typeof import("node:fs")>();
  return { ...orig, readFileSync: vi.fn().mockReturnValue("transcript content") };
});

describe("TaskResourceManager", () => {
  let jira: ReturnType<typeof createMockJiraClient>;
  let logger: ReturnType<typeof createMockLogger>;
  let resources: TaskJiraResourceManager;

  beforeEach(() => {
    jira = createMockJiraClient();
    logger = createMockLogger();
    resources = new TaskJiraResourceManager(jira, logger, { delayMs: 1 });
  });

  describe("fetchComments", () => {
    it("formats comments with timestamp and author", async () => {
      jira.getComments.mockResolvedValue([
        makeComment("1", "First comment", "2026-01-15T10:00:00Z"),
        makeComment("2", "Second comment", "2026-01-15T11:00:00Z"),
      ]);

      const result = await resources.fetchComments("DF-100");

      expect(result).toHaveLength(2);
      expect(result[0]).toBe("[2026-01-15T10:00:00Z] Test User:\nFirst comment");
      expect(result[1]).toBe("[2026-01-15T11:00:00Z] Test User:\nSecond comment");
    });

    it("extracts text from ADF comment bodies", async () => {
      jira.getComments.mockResolvedValue([{
        id: "1",
        author: { displayName: "Alice" },
        created: "2026-01-15T10:00:00Z",
        body: {
          type: "doc",
          content: [{
            type: "paragraph",
            content: [{ type: "text", text: "ADF content" }],
          }],
        },
      }]);

      const result = await resources.fetchComments("DF-100");

      expect(result[0]).toContain("ADF content");
    });

    it("returns empty array when getComments fails", async () => {
      jira.getComments.mockRejectedValue(new Error("JIRA down"));

      const result = await resources.fetchComments("DF-100");

      expect(result).toEqual([]);
      expect(logger.warn).toHaveBeenCalledWith(
        expect.stringContaining("Failed to fetch comments"),
      );
    });
  });

  describe("fetchHandoff", () => {
    it("returns content of the most recent handoff.md", async () => {
      jira.getAttachments.mockResolvedValue([
        { id: "1", filename: "handoff.md", content: "https://jira/att/1", created: "2026-01-10T00:00:00Z" },
        { id: "2", filename: "handoff.md", content: "https://jira/att/2", created: "2026-01-15T00:00:00Z" },
      ]);
      jira.downloadAttachment.mockResolvedValue("# Handoff v2");

      const result = await resources.fetchHandoff("DF-100");

      expect(result).toBe("# Handoff v2");
      expect(jira.downloadAttachment).toHaveBeenCalledWith("https://jira/att/2");
    });

    it("returns null when no handoff.md exists", async () => {
      jira.getAttachments.mockResolvedValue([
        { id: "1", filename: "other.txt", content: "https://jira/att/1", created: "2026-01-10T00:00:00Z" },
      ]);

      const result = await resources.fetchHandoff("DF-100");

      expect(result).toBeNull();
      expect(jira.downloadAttachment).not.toHaveBeenCalled();
    });

    it("returns null when getAttachments fails", async () => {
      jira.getAttachments.mockRejectedValue(new Error("Network error"));

      const result = await resources.fetchHandoff("DF-100");

      expect(result).toBeNull();
      expect(logger.warn).toHaveBeenCalledWith(
        expect.stringContaining("Failed to fetch attachments"),
      );
    });

    it("returns null when download fails", async () => {
      jira.getAttachments.mockResolvedValue([
        { id: "1", filename: "handoff.md", content: "https://jira/att/1", created: "2026-01-10T00:00:00Z" },
      ]);
      jira.downloadAttachment.mockRejectedValue(new Error("403 Forbidden"));

      const result = await resources.fetchHandoff("DF-100");

      expect(result).toBeNull();
      expect(logger.warn).toHaveBeenCalledWith(
        expect.stringContaining("Failed to download handoff.md"),
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

      await resources.attachTranscript("DF-100", "/tmp/transcript.md", "ralph");

      expect(jira.addAttachment).toHaveBeenCalledWith(
        "DF-100",
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
      jira.addAttachment.mockRejectedValue(new Error("Upload failed"));

      await resources.attachTranscript("DF-100", "/tmp/transcript.md", "ralph");

      expect(logger.warn).toHaveBeenCalledWith(
        expect.stringContaining("Failed to attach transcript"),
      );
    });

    it("logs warning when file read fails", async () => {
      const { readFileSync } = await import("node:fs");
      vi.mocked(readFileSync).mockImplementation(() => { throw new Error("ENOENT"); });

      await resources.attachTranscript("DF-100", "/tmp/missing.md", "ralph");

      expect(logger.warn).toHaveBeenCalledWith(
        expect.stringContaining("Failed to attach transcript"),
      );
    });
  });
});
