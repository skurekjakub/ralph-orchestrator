import { execa } from "execa";
import { existsSync, mkdirSync } from "node:fs";
import { rename, rm } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import type { ICliRuntimeRegistry } from "../cli/cli-runtime";
import { type IAgentProfile, VcsProvider } from "../config/types";
import { isSuccessfulStatus, type TaskStatus } from "../container/types";
import type { Logger } from "../logger";
import { toErrorMessage } from "../util/error";
import { assertSafeItemId } from "../util/safe-id";
import { appendGitExclude, gitExcludePatterns } from "./git-exclude";
import type { TaskContext } from "./task-context";

/** Where the orchestrator keeps its repository clones, under its checkout root. */
export interface RepoCachePaths {
  /** `cache/repos`: the orchestrator's own bare clone of each profile's repository, named after the profile id. */
  readonly sourceReposDir: string;
  /** `cache/workspaces`: one workspace per task, named after the task id (`<itemKey>-<startTs>`). */
  readonly workspacesDir: string;
}

/**
 * The repository cache paths of an orchestrator checkout.
 *
 * @param rootDir The orchestrator checkout root.
 */
export function repoCachePaths(rootDir: string): RepoCachePaths {
  const cacheDir = resolve(rootDir, "cache");
  return { sourceReposDir: join(cacheDir, "repos"), workspacesDir: join(cacheDir, "workspaces") };
}

/**
 * The git `http.extraHeader` auth header for the given VCS provider.
 *
 * - ADO: `Basic base64(:pat)` (empty username, PAT as password)
 * - GitHub: `Basic base64(x-access-token:pat)` (token auth)
 */
export function gitAuthHeader(provider: VcsProvider, pat: string): string {
  switch (provider) {
    case VcsProvider.Ado:
      return `Basic ${Buffer.from(`:${pat}`).toString("base64")}`;
    case VcsProvider.GitHub:
      return `Basic ${Buffer.from(`x-access-token:${pat}`).toString("base64")}`;
  }
}

/** Git never prompts for credentials: a rejected header fails the command instead of waiting on the terminal. */
const GIT_ENV = { GIT_TERMINAL_PROMPT: "0" };

/**
 * Run one git command and return its stdout.
 *
 * @param authHeader Sent as a per-command `http.extraHeader`, so no repository config stores it.
 * @throws Error when git fails; the message has `authHeader` replaced by `***`.
 */
async function git(args: readonly string[], authHeader?: string): Promise<string> {
  const authArgs = authHeader === undefined ? [] : ["-c", `http.extraHeader=Authorization: ${authHeader}`];
  try {
    const { stdout } = await execa("git", [...authArgs, ...args], { env: GIT_ENV });
    return stdout;
  } catch (err) {
    if (authHeader === undefined) throw err;
    throw new Error(toErrorMessage(err).replaceAll(authHeader, "***"));
  }
}

/** Whether `ref` resolves in the repository at `repoPath`. */
async function refExists(repoPath: string, ref: string): Promise<boolean> {
  const { exitCode } = await execa("git", ["-C", repoPath, "rev-parse", "--verify", "--quiet", ref], {
    env: GIT_ENV,
    reject: false,
  });
  return exitCode === 0;
}

/** Creates and removes the per-task workspace: the checkout of the target repository a task's containers mount at `/workspace`. */
export interface ITaskWorkspaceManager {
  /**
   * Create the task's workspace at `ctx.workspacePath`, checked out on the task branch.
   *
   * @throws Error when the work item id is unsafe as a directory name, the profile's `repoPat` env var is
   *   unset, the workspace already exists, the base branch (or, for a revision, the task branch) is not on
   *   the remote, or a git command fails.
   */
  prepare(ctx: TaskContext): Promise<void>;
  /**
   * Delete the task's workspace when the task ended with a successful `status`; keep it otherwise and log
   * where it is. Never throws.
   */
  cleanup(ctx: TaskContext, status: TaskStatus): Promise<void>;
}

/**
 * Gives each task its own checkout of the profile's repository, so no two tasks share a working tree.
 *
 * The orchestrator keeps one bare clone per profile under `cache/repos/<profileId>`, cloned from `repoUrl`
 * on first use and fetched, every branch, before each later task. A workspace is a `git clone --local` of
 * it (hard-linked objects, no network) whose `origin` is then pointed at `repoUrl`, so the agent and the
 * sidecar push straight to the real remote. Git authenticates with the profile's `repoPat` through a
 * per-command `http.extraHeader`, so no clone stores the credential.
 *
 * A profile's tasks share its bare clone without a lock: the orchestrator runs one operation at a time.
 */
export class TaskWorkspaceManager implements ITaskWorkspaceManager {
  private readonly logger: Logger;
  private readonly cliRuntimes: ICliRuntimeRegistry;
  private readonly sourceReposDir: string;

  constructor({
    logger,
    cliRuntimes,
    sourceReposDir,
  }: {
    logger: Logger;
    cliRuntimes: ICliRuntimeRegistry;
    /** Directory holding the bare clone of each profile's repository (`RepoCachePaths.sourceReposDir`). */
    sourceReposDir: string;
  }) {
    this.logger = logger;
    this.cliRuntimes = cliRuntimes;
    this.sourceReposDir = sourceReposDir;
  }

  /**
   * Bring the profile's bare clone up to date, clone the workspace from it on the base branch, exclude the
   * container CLIs' mount targets from git, check out the task branch and create `.ralph/tasks/<key>/`.
   *
   * The task branch is the remote's branch when it exists there, and otherwise a new branch from the base
   * branch; a revision requires the remote branch. The bare clone's fetch brings every remote branch, so
   * the workspace sees the remote as it was when this task started.
   */
  async prepare(ctx: TaskContext): Promise<void> {
    const { profile, workspacePath } = ctx;
    assertSafeItemId(ctx.workItem.id);
    const pat = process.env[profile.repoPat];
    if (!pat) throw new Error(`${profile.repoPat} must be set to clone ${profile.repoUrl} (profile "${profile.id}")`);
    if (existsSync(workspacePath)) throw new Error(`Workspace ${workspacePath} already exists`);

    const sourcePath = join(this.sourceReposDir, profile.id);
    await this.syncSource(profile, sourcePath, gitAuthHeader(profile.vcsProvider, pat));

    if (!(await refExists(sourcePath, `refs/heads/${ctx.sourceBranch}`))) {
      throw new Error(`Base branch "${ctx.sourceBranch}" does not exist on ${profile.repoUrl}`);
    }
    this.logger.info(`Creating workspace ${workspacePath} from ${ctx.sourceBranch}...`);
    mkdirSync(dirname(workspacePath), { recursive: true });
    // Not --shared: its alternates file names the bare clone's host path, which the containers cannot see.
    await git(["clone", "--local", "--branch", ctx.sourceBranch, sourcePath, workspacePath]);
    await git(["-C", workspacePath, "remote", "set-url", "origin", profile.repoUrl]);

    const mountTargets = this.cliRuntimes.forClis(profile.containerClis).flatMap((r) => r.workspaceMountTargets);
    appendGitExclude(workspacePath, gitExcludePatterns(mountTargets));

    await this.checkoutTaskBranch(ctx);
    mkdirSync(join(workspacePath, ".ralph", "tasks", ctx.workItem.id), { recursive: true });
    this.logger.info(`Workspace ready on ${ctx.taskBranch}`);
  }

  async cleanup(ctx: TaskContext, status: TaskStatus): Promise<void> {
    const { workspacePath } = ctx;
    if (!existsSync(workspacePath)) return;
    if (!isSuccessfulStatus(status)) {
      this.logger.warn(`Task ${ctx.taskId} ended with status ${status}; keeping its workspace at ${workspacePath}`);
      return;
    }
    try {
      await rm(workspacePath, { recursive: true, force: true });
      this.logger.info(`Deleted workspace ${workspacePath}`);
    } catch (err) {
      this.logger.warn(`Could not delete workspace ${workspacePath}: ${toErrorMessage(err)}`);
    }
  }

  /**
   * Clone `repoUrl` into `sourcePath` as a bare repository when it is missing, else fetch every branch into it.
   *
   * The first clone goes to a sibling directory renamed into place once complete, so an interrupted clone
   * never leaves a half-written repository at `sourcePath`.
   */
  private async syncSource(profile: IAgentProfile, sourcePath: string, authHeader: string): Promise<void> {
    if (!existsSync(sourcePath)) {
      this.logger.info(`Cloning ${profile.repoUrl} into ${sourcePath}...`);
      const partialPath = `${sourcePath}.partial`;
      await rm(partialPath, { recursive: true, force: true });
      mkdirSync(dirname(sourcePath), { recursive: true });
      await git(["clone", "--bare", profile.repoUrl, partialPath], authHeader);
      await rename(partialPath, sourcePath);
      return;
    }
    this.logger.info(`Fetching ${profile.repoUrl} into ${sourcePath}...`);
    await git(["-C", sourcePath, "remote", "set-url", "origin", profile.repoUrl]);
    await git(["-C", sourcePath, "fetch", "--prune", "origin", "+refs/heads/*:refs/heads/*"], authHeader);
  }

  /** Check out the task branch in the workspace: from the remote when it is there, else new from the base branch. */
  private async checkoutTaskBranch(ctx: TaskContext): Promise<void> {
    const { workspacePath, taskBranch, profile } = ctx;
    const onRemote = await refExists(workspacePath, `refs/remotes/origin/${taskBranch}`);
    if (onRemote) {
      this.logger.info(
        ctx.isRevision
          ? `Revision: checking out existing branch ${taskBranch}...`
          : `Branch ${taskBranch} exists on remote, checking out...`,
      );
      await git(["-C", workspacePath, "checkout", "-B", taskBranch, `origin/${taskBranch}`]);
      return;
    }
    if (ctx.isRevision) {
      throw new Error(`Revision branch "${taskBranch}" does not exist on ${profile.repoUrl}`);
    }
    this.logger.info(`Creating task branch ${taskBranch}...`);
    await git(["-C", workspacePath, "checkout", "-B", taskBranch]);
  }
}
