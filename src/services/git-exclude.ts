import { appendFileSync, existsSync, mkdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";

/** The directory the orchestrator owns in the workspace: prompt, logs, task files and CLI homes. */
const RALPH_DIR = ".ralph/";

/** Heads the patterns in the exclude file, telling a reader where they come from. */
const EXCLUDE_HEADER = "# ralph-orchestrator: paths the agent CLIs mount into the workspace";

/**
 * Git exclude patterns for the paths the agent CLIs mount into the workspace: `.ralph/`, plus each
 * mount target outside it, anchored to the repo root.
 *
 * @param mountTargets Workspace mount targets (`ICliRuntime.workspaceMountTargets`).
 */
export function gitExcludePatterns(mountTargets: readonly string[]): string[] {
  const outside = mountTargets.filter((target) => !target.startsWith(RALPH_DIR)).map((target) => `/${target}`);
  return [RALPH_DIR, ...new Set(outside)];
}

/**
 * Append `patterns` to the repository's `.git/info/exclude`, keeping what the file already holds.
 *
 * Keeps the bind-mount artifacts Docker creates in the workspace (skills, agents, `.ralph/`) out of
 * `git status` and out of what `git add` stages, so neither the agent nor the sidecar's push commits them.
 *
 * @param repoPath The repository's working tree.
 */
export function appendGitExclude(repoPath: string, patterns: readonly string[]): void {
  const excludePath = join(repoPath, ".git", "info", "exclude");
  mkdirSync(dirname(excludePath), { recursive: true });
  const existing = existsSync(excludePath) ? readFileSync(excludePath, "utf-8") : "";
  const separator = existing.length > 0 && !existing.endsWith("\n") ? "\n" : "";
  appendFileSync(excludePath, separator + [EXCLUDE_HEADER, ...patterns, ""].join("\n"), "utf-8");
}
