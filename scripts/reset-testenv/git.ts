import { existsSync, readdirSync, rmSync } from "node:fs";
import { join, resolve } from "node:path";
import { execFileSync } from "node:child_process";
import { readProfileFile, resolveProfileVariants } from "../../src/config/profile-variants";
import { gitAuthHeader, repoCachePaths } from "../../src/services/task-workspace-manager";
import { RESET_PROFILE_ID, type ResetContext } from "./types";

/** Run git with the profile's PAT as a per-command auth header; git never prompts. */
function authGit(authHeader: string, args: string[]): string {
  return execFileSync("git", ["-c", `http.extraHeader=Authorization: ${authHeader}`, ...args], {
    encoding: "utf-8",
    stdio: ["ignore", "pipe", "pipe"],
    env: { ...process.env, GIT_TERMINAL_PROMPT: "0" },
  });
}

/** Delete the issue's `ralph/<KEY>*` branches on the ralph-docs remote. */
function deleteRemoteBranches(ctx: ResetContext): void {
  const profileJson = resolve(ctx.rootDir, `profiles/${RESET_PROFILE_ID}/profile.json`);
  if (!existsSync(profileJson)) {
    console.log(`  ⚠ profiles/${RESET_PROFILE_ID}/profile.json not found, skipping remote branches`);
    return;
  }
  const [profile] = resolveProfileVariants(readProfileFile(profileJson), RESET_PROFILE_ID);
  const pat = process.env[profile.repoPat];
  if (!pat) {
    console.log(`  ⚠ ${profile.repoPat} is not set, skipping remote branches`);
    return;
  }
  const authHeader = gitAuthHeader(profile.vcsProvider, pat);
  const prefix = `refs/heads/ralph/${ctx.issueKey}`;

  try {
    const branches = authGit(authHeader, ["ls-remote", "--heads", profile.repoUrl])
      .split("\n")
      .map((line) => line.split("\t")[1]?.trim())
      .filter((ref): ref is string => Boolean(ref?.startsWith(prefix)))
      .map((ref) => ref.slice("refs/heads/".length));

    if (branches.length === 0) {
      console.log("  ✓ No remote ralph branches to delete");
      return;
    }
    for (const branch of branches) {
      authGit(authHeader, ["push", profile.repoUrl, "--delete", branch]);
      console.log(`  ✓ Deleted remote branch: ${branch}`);
    }
  } catch (err) {
    const message = err instanceof Error ? err.message.replaceAll(authHeader, "***") : String(err);
    console.log(`  ⚠ Could not clean remote branches: ${message}`);
  }
}

/** Delete the issue's task workspaces under `cache/workspaces/` (`<KEY>-<startTs>`). */
function deleteWorkspaces(ctx: ResetContext): void {
  const { workspacesDir } = repoCachePaths(ctx.rootDir);
  const workspaces = existsSync(workspacesDir)
    ? readdirSync(workspacesDir).filter((name) => name.startsWith(`${ctx.issueKey}-`))
    : [];
  if (workspaces.length === 0) {
    console.log("  ✓ No workspaces to delete");
    return;
  }
  for (const name of workspaces) {
    const workspacePath = join(workspacesDir, name);
    try {
      rmSync(workspacePath, { recursive: true, force: true });
      console.log(`  ✓ Deleted workspace: ${workspacePath}`);
    } catch (err) {
      console.log(`  ⚠ Could not delete ${workspacePath}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }
}

/**
 * Delete the issue's `ralph/<KEY>*` branches on the ralph-docs remote and its task workspaces.
 *
 * The orchestrator's bare clone under `cache/repos/` drops the deleted branches on the next task's fetch.
 */
export function cleanBranches(ctx: ResetContext) {
  deleteRemoteBranches(ctx);
  deleteWorkspaces(ctx);
}
