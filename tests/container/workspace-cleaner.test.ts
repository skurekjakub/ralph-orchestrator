import { describe, it, expect } from "vitest";
import { ContainerWorkspaceCleaner } from "../../src/container/workspace-cleaner.js";
import { createMockLogger, createMockCompose } from "../helpers/mocks.js";
const SVC_APP = "app";

describe("ContainerWorkspaceCleaner", () => {
  describe("prepareConfigDir", () => {
    it("chowns the config dir and creates writable subdirectories", async () => {
      const { compose, exec } = createMockCompose();
      const logger = createMockLogger();
      const cleaner = new ContainerWorkspaceCleaner({ compose, logger });

      await cleaner.prepareConfigDir("/workspace/.ralph", ["session-state", "logs/cli-debug"]);

      expect(exec).toHaveBeenCalledTimes(5);
      expect(exec).toHaveBeenNthCalledWith(1, [
        "-T",
        "--user",
        "root",
        SVC_APP,
        "chown",
        "vscode:vscode",
        "/workspace/.ralph",
      ]);
      expect(exec).toHaveBeenNthCalledWith(2, ["-T", "--user", "root", SVC_APP, "mkdir", "-p", "session-state"]);
      expect(exec).toHaveBeenNthCalledWith(3, [
        "-T",
        "--user",
        "root",
        SVC_APP,
        "chown",
        "vscode:vscode",
        "session-state",
      ]);
      expect(exec).toHaveBeenNthCalledWith(4, ["-T", "--user", "root", SVC_APP, "mkdir", "-p", "logs/cli-debug"]);
      expect(exec).toHaveBeenNthCalledWith(5, [
        "-T",
        "--user",
        "root",
        SVC_APP,
        "chown",
        "vscode:vscode",
        "logs/cli-debug",
      ]);
      expect(logger.info).toHaveBeenCalledWith("Config directory ready: /workspace/.ralph");
    });

    it("handles empty writable dirs list", async () => {
      const { compose, exec } = createMockCompose();
      const logger = createMockLogger();
      const cleaner = new ContainerWorkspaceCleaner({ compose, logger });

      await cleaner.prepareConfigDir("/workspace/.ralph", []);

      expect(exec).toHaveBeenCalledTimes(1);
      expect(exec).toHaveBeenCalledWith([
        "-T",
        "--user",
        "root",
        SVC_APP,
        "chown",
        "vscode:vscode",
        "/workspace/.ralph",
      ]);
    });

    it("warns on failure without throwing", async () => {
      const { compose, exec } = createMockCompose();
      exec.mockRejectedValueOnce(new Error("Permission denied"));
      const logger = createMockLogger();
      const cleaner = new ContainerWorkspaceCleaner({ compose, logger });

      await cleaner.prepareConfigDir("/workspace/.ralph", ["session-state"]);

      expect(logger.warn).toHaveBeenCalledWith(expect.stringContaining("Permission denied"));
    });
  });

  describe("cleanLogDirectory", () => {
    it("removes, recreates, and chowns the log directory as root", async () => {
      const { compose, exec } = createMockCompose();
      const logger = createMockLogger();
      const cleaner = new ContainerWorkspaceCleaner({ compose, logger });

      await cleaner.cleanDirectory("/workspace/.ralph/logs/session.audit.jsonl");

      expect(exec).toHaveBeenCalledTimes(3);
      expect(exec).toHaveBeenNthCalledWith(1, [
        "-T",
        "--user",
        "root",
        SVC_APP,
        "rm",
        "-rf",
        "/workspace/.ralph/logs/",
      ]);
      expect(exec).toHaveBeenNthCalledWith(2, [
        "-T",
        "--user",
        "root",
        SVC_APP,
        "mkdir",
        "-p",
        "/workspace/.ralph/logs/",
      ]);
      expect(exec).toHaveBeenNthCalledWith(3, [
        "-T",
        "--user",
        "root",
        SVC_APP,
        "chown",
        "vscode:vscode",
        "/workspace/.ralph/logs/",
      ]);
      expect(logger.info).toHaveBeenCalledWith("Logs directory ready: /workspace/.ralph/logs/");
    });

    it("warns on failure without throwing", async () => {
      const { compose, exec } = createMockCompose();
      exec.mockRejectedValueOnce(new Error("Permission denied"));
      const logger = createMockLogger();
      const cleaner = new ContainerWorkspaceCleaner({ compose, logger });

      await cleaner.cleanDirectory("/workspace/.ralph/logs/audit.jsonl");

      expect(logger.warn).toHaveBeenCalledWith(expect.stringContaining("Permission denied"));
    });
  });

  describe("cleanPaths", () => {
    it("removes each path as root", async () => {
      const { compose, exec } = createMockCompose();
      const logger = createMockLogger();
      const cleaner = new ContainerWorkspaceCleaner({ compose, logger });

      await cleaner.cleanPaths(["/workspace/resources/chats", "/workspace/.tmp"]);

      expect(exec).toHaveBeenCalledTimes(2);
      expect(exec).toHaveBeenNthCalledWith(1, [
        "-T",
        "--user",
        "root",
        SVC_APP,
        "rm",
        "-rf",
        "/workspace/resources/chats",
      ]);
      expect(exec).toHaveBeenNthCalledWith(2, ["-T", "--user", "root", SVC_APP, "rm", "-rf", "/workspace/.tmp"]);
      expect(logger.info).toHaveBeenCalledTimes(2);
    });

    it("warns on failure per path without stopping", async () => {
      const { compose, exec } = createMockCompose();
      exec.mockRejectedValueOnce(new Error("Permission denied")).mockResolvedValueOnce({ stdout: "", stderr: "" });
      const logger = createMockLogger();
      const cleaner = new ContainerWorkspaceCleaner({ compose, logger });

      await cleaner.cleanPaths(["/workspace/a", "/workspace/b"]);

      expect(logger.warn).toHaveBeenCalledWith(expect.stringContaining("Permission denied"));
      expect(logger.info).toHaveBeenCalledWith("Cleaned: /workspace/b");
    });

    it("does nothing for empty paths array", async () => {
      const { compose, exec } = createMockCompose();
      const logger = createMockLogger();
      const cleaner = new ContainerWorkspaceCleaner({ compose, logger });

      await cleaner.cleanPaths([]);

      expect(exec).not.toHaveBeenCalled();
    });
  });
});
