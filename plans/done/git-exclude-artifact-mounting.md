# Fix: Git Conflicts from Docker-Mounted Artifacts

**Status:** In progress  
**Date:** 2026-03-04

## Problem

Docker compose mounts create files on the host inside the target repo directory
(`TARGET_REPO_PATH`). Specifically:

- `.github/skills/.gitignore` — bind-mounted from `.build/github-gitignore`
- `.github/skills/<name>/` — empty dirs created by Docker for each skill mount
- `.github/agents/<name>.agent.md` — same pattern

These persist after `docker compose down`. The ADO MCP server's
`gitStageCommitPush()` only excludes `.ralph/*` — everything under
`.github/skills/` and `.github/agents/` gets committed to the task branch.

On next execution, `RepoSyncHook` runs `git checkout <task-branch>` and git
refuses because untracked host-side files conflict with tracked versions on the
remote branch:

```
error: The following untracked working tree files would be overwritten by checkout:
    .github/skills/.gitignore
```

## Solution: `.git/info/exclude`

Use git's built-in local exclusion mechanism (`.git/info/exclude`). This file is:
- Never committed, never tracked
- Respected by `git status`, `git add`, **and** `git checkout`
- Shared between `app` and `mcp-sidecar` containers via the same bind mount

### Changes

1. **`src/container/lifecycle.ts`** — `RepoSyncHook.execute()` writes a managed
   section to `.git/info/exclude` before any git operations. Uses marker comments
   for idempotent updates (replace existing block, append if absent).

2. **`src/container/setup/compose-overlay.ts`** — Remove the
   `.github/skills/.gitignore` mount line. The `.ralph/.gitignore` mount is kept
   as defense-in-depth.

3. **`src/container/setup/profile-setup.ts`** — Remove `github-gitignore` file
   generation.

4. **Tests** — Update `lifecycle.test.ts` for the new `writeFileSync` calls.
   Update any overlay/profile-setup tests that assert on the removed files.

### Why not clean up after?

The exclude entries are left permanently in `.git/info/exclude`. This is
deliberate:
- The file is local-only (never committed)
- Entries are needed for the *next* run too
- If present before `docker compose up`, they prevent git issues even if the
  managed-section write fails
- Self-heals if the repo is re-cloned (next task writes the section again)

### Out of Scope

Existing remote branches that already have `.github/skills/.gitignore` committed
need manual cleanup (delete the file, force-push). This plan only prevents future
occurrences.
