---
name: ralph-workflow-commit
description: "Standard workflow Phase 6. Read this skill when writing and review are done and you're ready to commit. Covers the pre-commit checkpoint (verify identifiers match frontmatter, source references present, build passes), staging, committing with the correct message format, and pushing to the task branch."
---

# Phase 6: Commit & Push

## Before you begin

1. **Read `state.md`** at `resources/chats/{{ taskId }}/state.md`
2. **Verify the current phase** — this skill is for Phase 6. If `state.md` shows a different current phase, update it now.
3. **Review completed phases** — confirm writing is complete and review is done (or skipped).

## Instructions

**Pre-commit checkpoint:** Re-read `state.md` and verify:
- Every identifier recorded there appears correctly in both the page frontmatter AND `documentation.yml` (see the **ralph-new-page-creation** skill if unsure about format or registration)
- Every source code reference noted by the researcher is accounted for in the handoff draft
- `npm run build` passes cleanly — if it fails, consult the **ralph-build-errors** skill

Stage and commit with a descriptive message:

```bash
git add -A
git commit -m "docs({{ taskId }}): <brief description of changes>"
git push origin ralph/{{ taskId }}-<short-slug>
```

## Before moving to Phase 7

Update `state.md`:
- Set "Current Phase" to `Phase 7: Pull Request`
- Set "Skills for this phase" to:
  - ralph-workflow-pr
  - ralph-ado-pr-workflow
- Add Phase 6 to "Completed Phases" with commit hash
