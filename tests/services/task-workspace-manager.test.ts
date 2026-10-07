/**
 * TaskWorkspaceManager unit tests: git is mocked, so these check which git commands run, with which
 * credentials, and how failures surface. The filesystem is a real temp directory; a mocked `clone`
 * creates its target directory. `task-workspace-manager.git.test.ts` runs the same flows against real
 * repositories.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { execa } from "execa";
import { rm } from "node:fs/promises";
import { TaskWorkspaceManager, taskWorkspacePath } from "../../src/services/task-workspace-manager";
import { createCliRuntimeRegistry } from "../../src/cli/supported-runtimes";
import { ClaudeAuthMode, CliType, VcsProvider } from "../../src/config/types";
import { TaskStatus } from "../../src/container/types";
import type { TaskContext } from "../../src/services/task-context";
import { makeProfile, makeStage, makeTaskContext, makeWorkItem } from "../helpers/factories";
import { createMockLogger, fakeExecResult } from "../helpers/mocks";

vi.mock("execa", async (importOriginal) => {
  const orig = await importOriginal<typeof import("execa")>();
  return { ...orig, execa: vi.fn() };
});

vi.mock("node:fs/promises", async (importOriginal) => {
  const orig = await importOriginal<typeof import("node:fs/promises")>();
  return { ...orig, rm: vi.fn(orig.rm) };
});

const mockExeca = vi.mocked(execa);
const REPO_URL = "https://dev.azure.com/org/project/_git/docs";
const PAT = "test-pat";
const ADO_HEADER = `Basic ${Buffer.from(`:${PAT}`).toString("base64")}`;
const AUTH = ["-c", `http.extraHeader=Authorization: ${ADO_HEADER}`];
const RUNTIMES = createCliRuntimeRegistry(ClaudeAuthMode.OAuthToken);

/**
 * Stand in for git: a clone creates its target directory, `rev-parse --verify` finds only `refs`, and
 * every other command succeeds.
 */
function fakeGit(refs: readonly string[]): void {
  mockExeca.mockImplementation(((_file: string, args: readonly string[]) => {
    const subcommandAt = args.findIndex((arg) => arg === "clone" || arg === "rev-parse");
    if (args[subcommandAt] === "clone") mkdirSync(args.at(-1)!, { recursive: true });
    if (args[subcommandAt] === "rev-parse") {
      return Promise.resolve(fakeExecResult({ exitCode: refs.includes(args.at(-1)!) ? 0 : 1 }));
    }
    return Promise.resolve(fakeExecResult());
  }) as any);
}

/** The arguments of every git command run, in order. */
function gitCalls(): string[][] {
  return mockExeca.mock.calls.map(([, args]) => [...(args as string[])]);
}

describe("TaskWorkspaceManager", () => {
  let root: string;
  let sourceReposDir: string;
  let logger: ReturnType<typeof createMockLogger>;

  /** A task of the `docs` profile whose workspace lives under the temp root. */
  function taskContext(overrides: Partial<TaskContext> = {}): TaskContext {
    return makeTaskContext({
      profile: makeProfile({ id: "docs", repoUrl: REPO_URL, repoPat: "DOCS_PAT" }),
      workItem: makeWorkItem("DF-100"),
      taskBranch: "ralph/DF-100-fix-docs",
      workspacePath: join(root, "workspaces", "DF-100-1234567890000"),
      ...overrides,
    });
  }

  function manager(): TaskWorkspaceManager {
    return new TaskWorkspaceManager({ logger, cliRuntimes: RUNTIMES, sourceReposDir });
  }

  beforeEach(() => {
    vi.clearAllMocks();
    root = mkdtempSync(join(tmpdir(), "task-workspace-"));
    sourceReposDir = join(root, "repos");
    logger = createMockLogger();
    vi.stubEnv("DOCS_PAT", PAT);
    fakeGit(["refs/heads/main"]);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    rmSync(root, { recursive: true, force: true });
  });

  describe("prepare", () => {
    it("clones repoUrl as the profile's bare clone on first use, with the PAT only as a per-command header", async () => {
      // Act
      await manager().prepare(taskContext());

      // Assert
      const source = join(sourceReposDir, "docs");
      expect(gitCalls()[0]).toEqual([...AUTH, "clone", "--bare", REPO_URL, `${source}.partial`]);
      expect(existsSync(source)).toBe(true);
      expect(existsSync(`${source}.partial`)).toBe(false);
      expect(gitCalls().some((args) => args.includes("fetch"))).toBe(false);
    });

    it("fetches every branch into the existing bare clone before a later task", async () => {
      // Arrange
      const source = join(sourceReposDir, "docs");
      mkdirSync(source, { recursive: true });

      // Act
      await manager().prepare(taskContext());

      // Assert
      expect(gitCalls().slice(0, 2)).toEqual([
        ["-C", source, "remote", "set-url", "origin", REPO_URL],
        [...AUTH, "-C", source, "fetch", "--prune", "origin", "+refs/heads/*:refs/heads/*"],
      ]);
      expect(gitCalls().some((args) => args.includes("--bare"))).toBe(false);
    });

    it("clones the workspace from the bare clone on the base branch, without credentials, and points origin at repoUrl", async () => {
      // Arrange
      fakeGit(["refs/heads/develop"]);
      const ctx = taskContext({ sourceBranch: "develop" });

      // Act
      await manager().prepare(ctx);

      // Assert
      const source = join(sourceReposDir, "docs");
      expect(gitCalls()).toContainEqual(["clone", "--local", "--branch", "develop", source, ctx.workspacePath]);
      expect(gitCalls()).toContainEqual(["-C", ctx.workspacePath, "remote", "set-url", "origin", REPO_URL]);
    });

    it("creates the task branch from the base branch when the remote has none", async () => {
      // Arrange
      const ctx = taskContext();

      // Act
      await manager().prepare(ctx);

      // Assert
      expect(gitCalls().at(-1)).toEqual(["-C", ctx.workspacePath, "checkout", "-B", "ralph/DF-100-fix-docs"]);
    });

    it.each([
      ["a new task", false],
      ["a revision", true],
    ])("checks out the remote's task branch for %s when the remote has it", async (_label, isRevision) => {
      // Arrange
      fakeGit(["refs/heads/main", "refs/remotes/origin/ralph/DF-100-fix-docs"]);
      const ctx = taskContext({ isRevision });

      // Act
      await manager().prepare(ctx);

      // Assert
      expect(gitCalls().at(-1)).toEqual([
        "-C",
        ctx.workspacePath,
        "checkout",
        "-B",
        "ralph/DF-100-fix-docs",
        "origin/ralph/DF-100-fix-docs",
      ]);
    });

    it("throws for a revision whose task branch is not on the remote", async () => {
      // Act & Assert
      await expect(manager().prepare(taskContext({ isRevision: true }))).rejects.toThrow(
        `Revision branch "ralph/DF-100-fix-docs" does not exist on ${REPO_URL}`,
      );
    });

    it("throws without cloning a workspace when the base branch is not on the remote", async () => {
      // Arrange
      const ctx = taskContext({ sourceBranch: "release/9" });

      // Act & Assert
      await expect(manager().prepare(ctx)).rejects.toThrow(`Base branch "release/9" does not exist on ${REPO_URL}`);
      expect(existsSync(ctx.workspacePath)).toBe(false);
    });

    it("excludes the mount targets of the CLIs its container stages run from git", async () => {
      // Arrange
      const copilot = taskContext();
      const claude = taskContext({
        profile: makeProfile({ id: "docs", repoPat: "DOCS_PAT", stages: [makeStage({ cli: CliType.Claude })] }),
        workspacePath: join(root, "workspaces", "DF-100-2"),
      });

      // Act
      await manager().prepare(copilot);
      await manager().prepare(claude);

      // Assert
      const excludes = (ctx: TaskContext) => readFileSync(join(ctx.workspacePath, ".git", "info", "exclude"), "utf-8");
      expect(excludes(copilot)).toContain(
        ".ralph/\n/.github/hooks/ralph-audit.json\n/.github/agents/\n/.github/skills/\n",
      );
      expect(excludes(claude)).toMatch(/\n\.ralph\/\n$/);
    });

    it("creates the task's .ralph/tasks/<key>/ directory", async () => {
      // Arrange
      const ctx = taskContext();

      // Act
      await manager().prepare(ctx);

      // Assert
      expect(existsSync(join(ctx.workspacePath, ".ralph", "tasks", "DF-100"))).toBe(true);
    });

    it("sends the GitHub token header for a GitHub profile", async () => {
      // Arrange
      const ctx = taskContext({
        profile: makeProfile({ id: "docs", vcsProvider: VcsProvider.GitHub, repoPat: "DOCS_PAT" }),
      });
      const header = `Basic ${Buffer.from(`x-access-token:${PAT}`).toString("base64")}`;

      // Act
      await manager().prepare(ctx);

      // Assert
      expect(gitCalls()[0].slice(0, 2)).toEqual(["-c", `http.extraHeader=Authorization: ${header}`]);
    });

    it("throws before running git when the repoPat env var is unset", async () => {
      // Arrange
      vi.stubEnv("DOCS_PAT", "");

      // Act & Assert
      await expect(manager().prepare(taskContext())).rejects.toThrow(
        `DOCS_PAT must be set to clone ${REPO_URL} (profile "docs")`,
      );
      expect(mockExeca).not.toHaveBeenCalled();
    });

    it("throws before running git for a work item id that is unsafe as a directory name", async () => {
      // Act & Assert
      await expect(manager().prepare(taskContext({ workItem: makeWorkItem("../DF-100") }))).rejects.toThrow(
        'Unsafe work item ID for filesystem use: "../DF-100"',
      );
      expect(mockExeca).not.toHaveBeenCalled();
    });

    it("throws when the workspace already exists", async () => {
      // Arrange
      const ctx = taskContext();
      mkdirSync(ctx.workspacePath, { recursive: true });

      // Act & Assert
      await expect(manager().prepare(ctx)).rejects.toThrow(`Workspace ${ctx.workspacePath} already exists`);
      expect(mockExeca).not.toHaveBeenCalled();
    });

    it("fails with git's error, the auth header redacted, and leaves no bare clone when the clone fails", async () => {
      // Arrange
      mockExeca.mockRejectedValueOnce(
        new Error(`Command failed: git -c http.extraHeader=Authorization: ${ADO_HEADER} clone: repository not found`),
      );

      // Act
      const failure = manager().prepare(taskContext());

      // Assert
      await expect(failure).rejects.toThrow(
        "Command failed: git -c http.extraHeader=Authorization: *** clone: repository not found",
      );
      expect(existsSync(join(sourceReposDir, "docs"))).toBe(false);
    });

    it("fails with the redacted git error when the remote cannot be fetched", async () => {
      // Arrange
      mkdirSync(join(sourceReposDir, "docs"), { recursive: true });
      mockExeca
        .mockResolvedValueOnce(fakeExecResult())
        .mockRejectedValueOnce(new Error(`fetch with ${ADO_HEADER}: Could not resolve host: dev.azure.com`));

      // Act & Assert
      await expect(manager().prepare(taskContext())).rejects.toThrow(
        "fetch with ***: Could not resolve host: dev.azure.com",
      );
    });
  });

  describe("cleanup", () => {
    it.each([TaskStatus.Completed, TaskStatus.Partial])(
      "deletes the workspace of a task that ended %s",
      async (status) => {
        // Arrange
        const ctx = taskContext();
        mkdirSync(join(ctx.workspacePath, ".git"), { recursive: true });

        // Act
        await manager().cleanup(ctx, status);

        // Assert
        expect(existsSync(ctx.workspacePath)).toBe(false);
      },
    );

    it.each([TaskStatus.Error, TaskStatus.Blocked])(
      "keeps the workspace of a task that ended %s and logs where it is",
      async (status) => {
        // Arrange
        const ctx = taskContext();
        mkdirSync(ctx.workspacePath, { recursive: true });

        // Act
        await manager().cleanup(ctx, status);

        // Assert
        expect(existsSync(ctx.workspacePath)).toBe(true);
        expect(logger.warn).toHaveBeenCalledWith(expect.stringContaining(ctx.workspacePath));
      },
    );

    it("does nothing for a workspace that was never created", async () => {
      // Act
      await manager().cleanup(taskContext(), TaskStatus.Error);

      // Assert
      expect(logger.warn).not.toHaveBeenCalled();
      expect(rm).not.toHaveBeenCalled();
    });

    it("logs instead of throwing when the workspace cannot be deleted", async () => {
      // Arrange
      const ctx = taskContext();
      mkdirSync(ctx.workspacePath, { recursive: true });
      vi.mocked(rm).mockRejectedValueOnce(new Error("EACCES: permission denied"));

      // Act
      await manager().cleanup(ctx, TaskStatus.Completed);

      // Assert
      expect(logger.warn).toHaveBeenCalledWith(
        `Could not delete workspace ${ctx.workspacePath}: EACCES: permission denied`,
      );
    });
  });
});

describe("taskWorkspacePath", () => {
  it("places a task's workspace in the checkout's cache/workspaces, named after the task", () => {
    // Act & Assert
    expect(taskWorkspacePath("/srv/ralph", "DF-1-123")).toBe(join("/srv/ralph", "cache", "workspaces", "DF-1-123"));
  });
});
