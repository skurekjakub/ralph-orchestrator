import { execa } from "execa";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { IContainerManager } from "./manager.js";
import type { Logger } from "../logger.js";
import { TaskContext } from "../services/task-context.js";
import { VcsProvider } from "../config/types.js";
import { slugifyBranchName } from "../util/branch.js";

/**
 * A pre-execution hook that runs between container setup and agent execution.
 *
 * Hooks execute sequentially in registration order. A failing hook aborts the task.
 */
export interface ILifecycleHook {
  /** Human-readable hook name for logging. */
  readonly name: string;
  /** Execute the hook. Throw to abort the task. */
  execute(container: IContainerManager, taskCtx: TaskContext, logger: Logger): Promise<void>;
}

/**
 * Build the git `http.extraHeader` auth header for the given VCS provider.
 *
 * - ADO: `Basic base64(:pat)` (empty username, PAT as password)
 * - GitHub: `Basic base64(x-access-token:pat)` (token auth)
 */
function buildAuthHeader(provider: VcsProvider, pat: string): string {
  switch (provider) {
    case VcsProvider.Ado:
      return `Basic ${Buffer.from(`:${pat}`).toString("base64")}`;
    case VcsProvider.GitHub:
      return `Basic ${Buffer.from(`x-access-token:${pat}`).toString("base64")}`;
  }
}

const EXCLUDE_MARKER_START = "# >>>ralph-orchestrator (managed — do not edit)";
const EXCLUDE_MARKER_END = "# <<<ralph-orchestrator";

/** Patterns the orchestrator mounts into the container workspace via Docker bind mounts. */
const ORCHESTRATOR_EXCLUDE_PATTERNS = [
  ".ralph/",
  ".github/skills/",
  ".github/agents/",
];

/**
 * Write orchestrator-managed exclusion patterns to `.git/info/exclude`.
 *
 * Uses marker comments for idempotent updates — replaces the existing managed
 * block if present, appends if absent. Preserves any user-added content outside
 * the markers.
 *
 * This prevents Docker-created bind-mount artifacts (skills, agents, .ralph/)
 * from appearing in `git status`, being staged by `git add`, or blocking
 * `git checkout` when switching to branches that track those paths.
 */
export function ensureGitExclude(repoPath: string): void {
  const excludePath = join(repoPath, ".git", "info", "exclude");
  const infoDir = join(repoPath, ".git", "info");

  if (!existsSync(infoDir)) {
    mkdirSync(infoDir, { recursive: true });
  }

  const managedBlock = [
    EXCLUDE_MARKER_START,
    ...ORCHESTRATOR_EXCLUDE_PATTERNS,
    EXCLUDE_MARKER_END,
  ].join("\n");

  let content = "";
  if (existsSync(excludePath)) {
    content = readFileSync(excludePath, "utf-8");
  }

  const startIdx = content.indexOf(EXCLUDE_MARKER_START);
  const endIdx = content.indexOf(EXCLUDE_MARKER_END);

  if (startIdx !== -1 && endIdx !== -1 && endIdx > startIdx) {
    // Replace existing managed block (including trailing newline if present)
    const endOfBlock = endIdx + EXCLUDE_MARKER_END.length;
    const trailingNewline = content[endOfBlock] === "\n" ? 1 : 0;
    content = content.slice(0, startIdx) + managedBlock + "\n" + content.slice(endOfBlock + trailingNewline);
  } else {
    // No valid managed block found — strip any orphaned markers and append fresh
    content = content
      .split("\n")
      .filter((line) => line !== EXCLUDE_MARKER_START && line !== EXCLUDE_MARKER_END)
      .join("\n");
    const separator = content.length > 0 && !content.endsWith("\n") ? "\n" : "";
    content = content + separator + managedBlock + "\n";
  }

  writeFileSync(excludePath, content, "utf-8");
}

/**
 * Sync the repository to the default branch and create a task branch before agent execution.
 *
 * Runs git directly on the host using the profile's repo path. Running inside
 * any container would require the container's UID to own the `.git` directory —
 * not guaranteed when the workspace is bind-mounted from the host.
 * Credentials are passed via a per-command `http.extraHeader` override so the
 * PAT is never written to the on-disk git config.
 *
 * The auth format is determined by `profile.vcsProvider`; the credential env
 * var name is `profile.repoPat` (defaults to `ADO_PAT` or `GH_TOKEN`).
 *
 * After syncing, creates a task-scoped branch (`ralph/<key>-<slug>`) from the
 * source branch and prepares the `.ralph/tasks/<key>/` directory so the agent
 * starts on a ready workspace.
 */
export class RepoSyncHook implements ILifecycleHook {
  readonly name = "repo-sync";

  async execute(_container: IContainerManager, taskCtx: TaskContext, logger: Logger): Promise<void> {
    const { repoPat, vcsProvider, repoPath } = taskCtx.profile;
    const pat = process.env[repoPat];
    const defaultBranch: string = taskCtx.triggerParams['source_branch'] ?? "main";
    if (!pat) throw new Error(`${repoPat} must be set for repo-sync hook (profile "${taskCtx.profile.id}")`);

    // Write exclusion patterns before any git operation so Docker-created
    // bind-mount artifacts don't block checkout or appear in status/add.
    ensureGitExclude(repoPath);

    const authHeader = buildAuthHeader(vcsProvider, pat);
    const git = (args: string[]) => execa("git", ["-C", repoPath, ...args]);

    logger.info(`Syncing repo to ${defaultBranch}...`);
    await git(["-c", `http.extraHeader=Authorization: ${authHeader}`, "fetch", "origin", defaultBranch]);
    await git(["checkout", defaultBranch]);
    await git(["reset", "--hard", `origin/${defaultBranch}`]);
    logger.info("Repo sync complete");

    const taskBranch = slugifyBranchName(taskCtx.workItem.id, taskCtx.workItem.title);

    if (taskCtx.isRevision) {
      logger.info(`Revision: switching to existing branch ${taskBranch}...`);
      await git(["-c", `http.extraHeader=Authorization: ${authHeader}`, "fetch", "origin", taskBranch]);
      await git(["checkout", taskBranch]);
      await git(["reset", "--hard", `origin/${taskBranch}`]);
    } else {
      logger.info(`Creating task branch ${taskBranch}...`);
      await git(["checkout", "-b", taskBranch]);
    }

    const tasksDir = join(repoPath, ".ralph", "tasks", taskCtx.workItem.id);
    mkdirSync(tasksDir, { recursive: true });
    logger.info("Task branch and workspace ready");
  }
}
