---
name: ralph-workflow-commit
description: "Standard workflow Phase 6. Read this skill when the writer and reviewers are done and you're ready to commit. Covers the pre-commit checkpoint, staging, committing with the correct message format, and pushing to the task branch."
---

# Phase 6: Commit & Push

## Before you begin

1. **Read `state.md`** at `.ralph/tasks/{{ taskId }}/state.md`
2. **Verify the current phase** — this skill is for Phase 6. If `state.md` shows a different current phase, update it now.
3. **Review completed phases** — confirm writing is complete and review is done (or skipped).

## Instructions

**Pre-commit checkpoint:** Re-read `state.md` and verify:
- The latest writer `status.json` reported `result: implemented` (or the task is intentionally being delivered as `partial`)
- All review phases are complete (or skipped)

Stage, commit, and push:

1. Only stage files you actively worked on: `git add <files>`
2. Commit with a descriptive message following the format in `state.md`
3. Push using the `ado_push_progress` MCP tool — do NOT use `git push` directly

## Before moving to Phase 7

Update `state.md`:
- Set "Current Phase" to `Phase 7: Pull Request`
- Set "Skills for this phase" to:
  - ralph-workflow-pr
  - ralph-ado-pr-workflow
- Keep the reminder line: `> ⚠️ STOP — Read every skill listed above BEFORE doing any work in this phase.`
- Add Phase 6 to "Completed Phases" with commit hash
