import { describe, it, expect } from "vitest";
import { ContainerWorkspaceCleaner } from "../../src/container/workspace-cleaner.js";
import { createMockLogger, createMockCompose } from "../helpers/mocks.js";

describe("ContainerWorkspaceCleaner", () => {
  describe("cleanLogDirectory", () => {
    it("removes, recreates, and chowns the log directory as root", async () => {
      const { compose, exec } = createMockCompose();
      const logger = createMockLogger();
      const cleaner = new ContainerWorkspaceCleaner(compose, logger);

      await cleaner.cleanLogDirectory("/workspace/.ralph/logs/session.audit.jsonl");

      expect(exec).toHaveBeenCalledTimes(3);
      expect(exec).toHaveBeenNthCalledWith(1, ["-T", "--user", "root", "app", "rm", "-rf", "/workspace/.ralph/logs/"]);
      expect(exec).toHaveBeenNthCalledWith(2, ["-T", "--user", "root", "app", "mkdir", "-p", "/workspace/.ralph/logs/"]);
      expect(exec).toHaveBeenNthCalledWith(3, ["-T", "--user", "root", "app", "chown", "vscode:vscode", "/workspace/.ralph/logs/"]);
      expect(logger.info).toHaveBeenCalledWith("Logs directory ready: /workspace/.ralph/logs/");
    });

    it("warns on failure without throwing", async () => {
      const { compose, exec } = createMockCompose();
      exec.mockRejectedValueOnce(new Error("Permission denied"));
      const logger = createMockLogger();
      const cleaner = new ContainerWorkspaceCleaner(compose, logger);

      await cleaner.cleanLogDirectory("/workspace/.ralph/logs/audit.jsonl");

      expect(logger.warn).toHaveBeenCalledWith(expect.stringContaining("Permission denied"));
    });
  });

  describe("cleanPaths", () => {
    it("removes each path as root", async () => {
      const { compose, exec } = createMockCompose();
      const logger = createMockLogger();
      const cleaner = new ContainerWorkspaceCleaner(compose, logger);

      await cleaner.cleanPaths(["/workspace/resources/chats", "/workspace/.tmp"]);

      expect(exec).toHaveBeenCalledTimes(2);
      expect(exec).toHaveBeenNthCalledWith(1, ["-T", "--user", "root", "app", "rm", "-rf", "/workspace/resources/chats"]);
      expect(exec).toHaveBeenNthCalledWith(2, ["-T", "--user", "root", "app", "rm", "-rf", "/workspace/.tmp"]);
      expect(logger.info).toHaveBeenCalledTimes(2);
    });

    it("warns on failure per path without stopping", async () => {
      const { compose, exec } = createMockCompose();
      exec
        .mockRejectedValueOnce(new Error("Permission denied"))
        .mockResolvedValueOnce({ stdout: "", stderr: "" });
      const logger = createMockLogger();
      const cleaner = new ContainerWorkspaceCleaner(compose, logger);

      await cleaner.cleanPaths(["/workspace/a", "/workspace/b"]);

      expect(logger.warn).toHaveBeenCalledWith(expect.stringContaining("Permission denied"));
      expect(logger.info).toHaveBeenCalledWith("Cleaned: /workspace/b");
    });

    it("does nothing for empty paths array", async () => {
      const { compose, exec } = createMockCompose();
      const logger = createMockLogger();
      const cleaner = new ContainerWorkspaceCleaner(compose, logger);

      await cleaner.cleanPaths([]);

      expect(exec).not.toHaveBeenCalled();
    });
  });
});
