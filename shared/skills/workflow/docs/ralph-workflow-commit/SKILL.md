---
name: ralph-workflow-commit
description: "Standard workflow Phase 6. Read this skill when writing and review are done and you're ready to commit. Covers the pre-commit checkpoint (verify identifiers match frontmatter, source references present, build passes), staging, committing with the correct message format, and pushing to the task branch."
---

# Phase 6: Commit & Push

## Before you begin

1. **Read `state.md`** at `.ralph/tasks/{{ taskId }}/state.md`
2. **Verify the current phase** — this skill is for Phase 6. If `state.md` shows a different current phase, update it now.
3. **Review completed phases** — confirm writing is complete and review is done (or skipped).

## Instructions

**Pre-commit checkpoint:** Re-read `state.md` and verify:
- Every source code reference noted by the researcher is accounted for in the handoff draft
- `npm run build` passes cleanly — if it fails, consult the **ralph-build-errors** skill

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
