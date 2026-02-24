import { execa } from "execa";
import type { IContainerManager } from "./manager.js";
import type { Logger } from "../logger.js";
import { TaskContext } from "../services/task-context.js";

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
 * Sync the repository to the default branch before agent execution.
 *
 * Runs git directly on the host using the profile's repo path. Running inside
 * any container would require the container's UID to own the `.git` directory —
 * not guaranteed when the workspace is bind-mounted from the host.
 * Credentials are passed via a per-command `url.insteadOf` override so the
 * PAT is never written to the on-disk git config.
 */
export class RepoSyncHook implements ILifecycleHook {
  readonly name = "repo-sync";

  async execute(_container: IContainerManager, taskCtx: TaskContext, logger: Logger): Promise<void> {
    const adoPat: string | undefined = process.env.ADO_PAT;
    // TODO from bag
    const defaultBranch: string = taskCtx.triggerParams['source_branch'] ?? "main";
    if (!adoPat) throw new Error("ADO_PAT must be set for repo-sync hook");

    const credConfig = `url.https://pat:${adoPat}@dev.azure.com/.insteadOf=https://dev.azure.com/`;
    const git = (args: string[]) => execa("git", ["-C", taskCtx.profile.repoPath, ...args]);

    logger.info(`Syncing repo to ${defaultBranch}...`);
    await git(["-c", credConfig, "fetch", "origin", defaultBranch]);
    await git(["checkout", defaultBranch]);
    await git(["reset", "--hard", `origin/${defaultBranch}`]);
    logger.info("Repo sync complete");
  }
}
