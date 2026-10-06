import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { execSync } from "node:child_process";
import type { ResetContext } from "./types";

function resolveRepoPath(rootDir: string): string | null {
  const profileJson = resolve(rootDir, "profiles/ralph-docs/profile.json");
  if (!existsSync(profileJson)) return null;

  const profile = JSON.parse(readFileSync(profileJson, "utf-8"));
  return (profile.repo as string).replace(/^~/, process.env.HOME || "~");
}

export function cleanBranches(ctx: ResetContext) {
  const repoPath = resolveRepoPath(ctx.rootDir);
  if (!repoPath) {
    console.log("  ⚠ profiles/ralph-docs/profile.json not found, skipping");
    return;
  }
  if (!existsSync(repoPath)) {
    console.log(`  ⚠ Repo not found at ${repoPath}, skipping`);
    return;
  }

  const pattern = `ralph/${ctx.issueKey}`;
  const opts = {
    cwd: repoPath,
    encoding: "utf-8" as const,
    stdio: ["pipe", "pipe", "pipe"] as ["pipe", "pipe", "pipe"],
  };

  // Local branches
  try {
    const locals = execSync(`git branch --list "${pattern}*"`, opts)
      .trim()
      .split("\n")
      .map((b) => b.trim().replace(/^\* /, ""))
      .filter(Boolean);

    if (locals.length > 0) {
      execSync("git checkout main 2>/dev/null || git checkout master 2>/dev/null || true", opts);
      for (const branch of locals) {
        execSync(`git branch -D "${branch}"`, opts);
        console.log(`  ✓ Deleted local branch: ${branch}`);
      }
    } else {
      console.log("  ✓ No local ralph branches to delete");
    }
  } catch {
    console.log("  ✓ No local branches to clean");
  }

  // Remote branches
  try {
    const remotes = execSync(`git branch -r --list "origin/${pattern}*"`, opts)
      .trim()
      .split("\n")
      .map((b) => b.trim().replace("origin/", ""))
      .filter(Boolean);

    if (remotes.length > 0) {
      for (const branch of remotes) {
        execSync(`git push origin --delete "${branch}" 2>&1`, opts);
        console.log(`  ✓ Deleted remote branch: ${branch}`);
      }
    } else {
      console.log("  ✓ No remote ralph branches to delete");
    }
  } catch {
    console.log("  ✓ No remote branches to clean");
  }
}
