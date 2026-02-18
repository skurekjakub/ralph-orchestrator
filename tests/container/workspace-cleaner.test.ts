import { describe, it, expect, vi } from "vitest";
import { ContainerWorkspaceCleaner } from "../../src/container/workspace-cleaner.js";
import type { ComposeClient } from "../../src/container/compose-client.js";
import type { Logger } from "../../src/logger.js";

function makeMockLogger(): Logger {
  return {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  };
}

function makeMockCompose(): { compose: ComposeClient; exec: ReturnType<typeof vi.fn> } {
  const exec = vi.fn().mockResolvedValue({ stdout: "", stderr: "" });
  return { compose: { exec } as any, exec };
}

describe("ContainerWorkspaceCleaner", () => {
  describe("cleanLogDirectory", () => {
    it("removes, recreates, and chowns the log directory as root", async () => {
      const { compose, exec } = makeMockCompose();
      const logger = makeMockLogger();
      const cleaner = new ContainerWorkspaceCleaner(compose, logger);

      await cleaner.cleanLogDirectory("/workspace/.ralph/logs/session.audit.jsonl");

      expect(exec).toHaveBeenCalledTimes(3);
      expect(exec).toHaveBeenNthCalledWith(1, ["-T", "--user", "root", "app", "rm", "-rf", "/workspace/.ralph/logs/"]);
      expect(exec).toHaveBeenNthCalledWith(2, ["-T", "--user", "root", "app", "mkdir", "-p", "/workspace/.ralph/logs/"]);
      expect(exec).toHaveBeenNthCalledWith(3, ["-T", "--user", "root", "app", "chown", "vscode:vscode", "/workspace/.ralph/logs/"]);
      expect(logger.info).toHaveBeenCalledWith("Logs directory ready: /workspace/.ralph/logs/");
    });

    it("warns on failure without throwing", async () => {
      const { compose, exec } = makeMockCompose();
      exec.mockRejectedValueOnce(new Error("Permission denied"));
      const logger = makeMockLogger();
      const cleaner = new ContainerWorkspaceCleaner(compose, logger);

      await cleaner.cleanLogDirectory("/workspace/.ralph/logs/audit.jsonl");

      expect(logger.warn).toHaveBeenCalledWith(expect.stringContaining("Permission denied"));
    });
  });

  describe("cleanPaths", () => {
    it("removes each path as root", async () => {
      const { compose, exec } = makeMockCompose();
      const logger = makeMockLogger();
      const cleaner = new ContainerWorkspaceCleaner(compose, logger);

      await cleaner.cleanPaths(["/workspace/resources/chats", "/workspace/.tmp"]);

      expect(exec).toHaveBeenCalledTimes(2);
      expect(exec).toHaveBeenNthCalledWith(1, ["-T", "--user", "root", "app", "rm", "-rf", "/workspace/resources/chats"]);
      expect(exec).toHaveBeenNthCalledWith(2, ["-T", "--user", "root", "app", "rm", "-rf", "/workspace/.tmp"]);
      expect(logger.info).toHaveBeenCalledTimes(2);
    });

    it("warns on failure per path without stopping", async () => {
      const { compose, exec } = makeMockCompose();
      exec
        .mockRejectedValueOnce(new Error("Permission denied"))
        .mockResolvedValueOnce({ stdout: "", stderr: "" });
      const logger = makeMockLogger();
      const cleaner = new ContainerWorkspaceCleaner(compose, logger);

      await cleaner.cleanPaths(["/workspace/a", "/workspace/b"]);

      expect(logger.warn).toHaveBeenCalledWith(expect.stringContaining("Permission denied"));
      expect(logger.info).toHaveBeenCalledWith("Cleaned: /workspace/b");
    });

    it("does nothing for empty paths array", async () => {
      const { compose, exec } = makeMockCompose();
      const logger = makeMockLogger();
      const cleaner = new ContainerWorkspaceCleaner(compose, logger);

      await cleaner.cleanPaths([]);

      expect(exec).not.toHaveBeenCalled();
    });
  });
});
