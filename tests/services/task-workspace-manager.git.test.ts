/**
 * TaskWorkspaceManager against real repositories: a bare repository in a temp directory stands in for
 * the remote at `repoUrl`, and a seed clone pushes commits and branches to it. Git runs with the user's
 * global and system config switched off, so their settings cannot change the outcome.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { TaskWorkspaceManager } from "../../src/services/task-workspace-manager";
import { createCliRuntimeRegistry } from "../../src/cli/supported-runtimes";
import { ClaudeAuthMode } from "../../src/config/types";
import { TaskStatus } from "../../src/container/types";
import type { TaskContext } from "../../src/services/task-context";
import { makeProfile, makeTaskContext, makeWorkItem } from "../helpers/factories";
import { createMockLogger } from "../helpers/mocks";

const PAT = "integration-secret-pat";
const HEADER_CREDENTIAL = Buffer.from(`:${PAT}`).toString("base64");

/** Run git in `cwd` and return its trimmed stdout. */
function git(cwd: string, ...args: string[]): string {
  return execFileSync("git", args, { cwd, encoding: "utf-8", stdio: ["ignore", "pipe", "pipe"] }).trim();
}

describe("TaskWorkspaceManager with real repositories", () => {
  let root: string;
  let remote: string;
  let seed: string;
  let sourceReposDir: string;

  /** Commit `file` on `branch` in the seed clone, push it to the remote and return the commit id. */
  function pushCommit(branch: string, file: string): string {
    git(seed, "checkout", "-B", branch);
    writeFileSync(join(seed, file), `${file} on ${branch}\n`);
    git(seed, "add", file);
    git(seed, "commit", "-m", `Add ${file}`);
    git(seed, "push", "--force", "origin", `${branch}:${branch}`);
    return git(seed, "rev-parse", "HEAD");
  }

  /** A task of the `docs` profile on `repoUrl`, its workspace under the temp root. */
  function taskContext(name: string, overrides: Partial<TaskContext> = {}): TaskContext {
    return makeTaskContext({
      profile: makeProfile({ id: "docs", repoUrl: remote, repoPat: "DOCS_PAT" }),
      workItem: makeWorkItem("DF-200"),
      sourceBranch: "main",
      taskBranch: "ralph/DF-200-update-docs",
      workspacePath: join(root, "workspaces", name),
      ...overrides,
    });
  }

  function manager(): TaskWorkspaceManager {
    return new TaskWorkspaceManager({
      logger: createMockLogger(),
      cliRuntimes: createCliRuntimeRegistry(ClaudeAuthMode.OAuthToken),
      sourceReposDir,
    });
  }

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), "task-workspace-git-"));
    vi.stubEnv("GIT_CONFIG_GLOBAL", join(root, "no-global-config"));
    vi.stubEnv("GIT_CONFIG_NOSYSTEM", "1");
    vi.stubEnv("GIT_AUTHOR_NAME", "Test");
    vi.stubEnv("GIT_AUTHOR_EMAIL", "test@example.com");
    vi.stubEnv("GIT_COMMITTER_NAME", "Test");
    vi.stubEnv("GIT_COMMITTER_EMAIL", "test@example.com");
    vi.stubEnv("DOCS_PAT", PAT);

    remote = join(root, "remote.git");
    seed = join(root, "seed");
    sourceReposDir = join(root, "cache", "repos");
    git(root, "init", "--bare", "--initial-branch=main", remote);
    git(root, "clone", remote, seed);
    pushCommit("main", "README.md");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    rmSync(root, { recursive: true, force: true });
  });

  it("clones the remote on first use and creates the task branch from the base branch, origin at repoUrl", async () => {
    // Arrange
    const mainCommit = git(seed, "rev-parse", "main");
    const ctx = taskContext("DF-200-1");

    // Act
    await manager().prepare(ctx);

    // Assert
    expect(git(join(sourceReposDir, "docs"), "rev-parse", "--is-bare-repository")).toBe("true");
    expect(git(ctx.workspacePath, "symbolic-ref", "--short", "HEAD")).toBe("ralph/DF-200-update-docs");
    expect(git(ctx.workspacePath, "rev-parse", "HEAD")).toBe(mainCommit);
    expect(git(ctx.workspacePath, "remote", "get-url", "origin")).toBe(remote);
  });

  it("stores no credential in the configs of the bare clone and the workspace", async () => {
    // Arrange
    const ctx = taskContext("DF-200-1");

    // Act
    await manager().prepare(ctx);

    // Assert
    for (const config of [join(sourceReposDir, "docs", "config"), join(ctx.workspacePath, ".git", "config")]) {
      const content = readFileSync(config, "utf-8");
      expect(content).not.toContain(PAT);
      expect(content).not.toContain(HEADER_CREDENTIAL);
      expect(content).not.toContain("extraHeader");
    }
  });

  it("fetches the remote before the next task, so its workspace starts from the new base commit", async () => {
    // Arrange
    await manager().prepare(taskContext("DF-200-1"));
    const newMainCommit = pushCommit("main", "CHANGELOG.md");
    const next = taskContext("DF-200-2");

    // Act
    await manager().prepare(next);

    // Assert
    expect(git(next.workspacePath, "rev-parse", "HEAD")).toBe(newMainCommit);
  });

  it("checks out the task branch the remote already has, tracking it", async () => {
    // Arrange
    const branchCommit = pushCommit("ralph/DF-200-update-docs", "draft.md");
    const ctx = taskContext("DF-200-1");

    // Act
    await manager().prepare(ctx);

    // Assert
    expect(git(ctx.workspacePath, "rev-parse", "HEAD")).toBe(branchCommit);
    expect(git(ctx.workspacePath, "rev-parse", "--abbrev-ref", "@{upstream}")).toBe("origin/ralph/DF-200-update-docs");
  });

  it("checks out the remote task branch for a revision, including commits pushed after the first clone", async () => {
    // Arrange
    await manager().prepare(taskContext("DF-200-1"));
    const reviewedCommit = pushCommit("ralph/DF-200-update-docs", "draft.md");
    const revision = taskContext("DF-200-2", { isRevision: true });

    // Act
    await manager().prepare(revision);

    // Assert
    expect(git(revision.workspacePath, "symbolic-ref", "--short", "HEAD")).toBe("ralph/DF-200-update-docs");
    expect(git(revision.workspacePath, "rev-parse", "HEAD")).toBe(reviewedCommit);
  });

  it("throws for a revision whose task branch the remote does not have", async () => {
    // Act & Assert
    await expect(manager().prepare(taskContext("DF-200-1", { isRevision: true }))).rejects.toThrow(
      `Revision branch "ralph/DF-200-update-docs" does not exist on ${remote}`,
    );
  });

  it("lets the task branch be pushed to repoUrl the way the sidecar pushes it", async () => {
    // Arrange
    const ctx = taskContext("DF-200-1");
    await manager().prepare(ctx);
    writeFileSync(join(ctx.workspacePath, "page.md"), "new page\n");
    git(ctx.workspacePath, "add", "page.md");
    git(ctx.workspacePath, "commit", "-m", "Add page");

    // Act
    git(ctx.workspacePath, "push", "origin", "HEAD:refs/heads/ralph/DF-200-update-docs", "--force-with-lease");

    // Assert
    expect(git(remote, "rev-parse", "refs/heads/ralph/DF-200-update-docs")).toBe(
      git(ctx.workspacePath, "rev-parse", "HEAD"),
    );
  });

  it("keeps .ralph/ and the CLIs' mount points out of git status", async () => {
    // Arrange
    const ctx = taskContext("DF-200-1");
    await manager().prepare(ctx);
    mkdirSync(join(ctx.workspacePath, ".github", "agents"), { recursive: true });
    writeFileSync(join(ctx.workspacePath, ".github", "agents", "ralph.agent.md"), "");
    writeFileSync(join(ctx.workspacePath, ".ralph", "prompt.md"), "");

    // Act
    const status = git(ctx.workspacePath, "status", "--porcelain", "--untracked-files=all");

    // Assert
    expect(status).toBe("");
    expect(existsSync(join(ctx.workspacePath, ".ralph", "tasks", "DF-200"))).toBe(true);
  });

  it("deletes the workspace after a successful task and keeps it after a failed one", async () => {
    // Arrange
    const succeeded = taskContext("DF-200-1");
    const failed = taskContext("DF-200-2");
    await manager().prepare(succeeded);
    await manager().prepare(failed);

    // Act
    await manager().cleanup(succeeded, TaskStatus.Completed);
    await manager().cleanup(failed, TaskStatus.Error);

    // Assert
    expect(existsSync(succeeded.workspacePath)).toBe(false);
    expect(existsSync(failed.workspacePath)).toBe(true);
    expect(git(join(sourceReposDir, "docs"), "rev-parse", "--is-bare-repository")).toBe("true");
  });

  it("fails to clone an unreachable remote and leaves no bare clone behind", async () => {
    // Arrange
    const missing = join(root, "missing.git");
    const ctx = taskContext("DF-200-1", {
      profile: makeProfile({ id: "docs", repoUrl: missing, repoPat: "DOCS_PAT" }),
    });

    // Act & Assert
    await expect(manager().prepare(ctx)).rejects.toThrow(/clone --bare/);
    expect(existsSync(join(sourceReposDir, "docs"))).toBe(false);
    expect(existsSync(join(sourceReposDir, "docs.partial"))).toBe(false);
    expect(existsSync(ctx.workspacePath)).toBe(false);
  });

  it("fails without leaking the credential when the remote is unreachable on a later fetch", async () => {
    // Arrange
    await manager().prepare(taskContext("DF-200-1"));
    renameSync(remote, join(root, "moved.git"));

    // Act
    const error = await manager()
      .prepare(taskContext("DF-200-2"))
      .then(
        () => null,
        (err: unknown) => err as Error,
      );

    // Assert
    expect(error?.message).toContain("fetch --prune origin");
    expect(error?.message).not.toContain(HEADER_CREDENTIAL);
  });

  it("fails before any git command when the PAT is not set", async () => {
    // Arrange
    vi.stubEnv("DOCS_PAT", "");

    // Act & Assert
    await expect(manager().prepare(taskContext("DF-200-1"))).rejects.toThrow("DOCS_PAT must be set");
    expect(existsSync(sourceReposDir)).toBe(false);
  });
});
