---
name: ralph-workflow-revision-commit
description: "Revision workflow Phase 5. Read this skill after fixes are implemented. Covers the pre-commit build check, committing to the existing branch, pushing, and responding to each PR review thread — resolving addressed threads and explaining any intentionally unaddressed feedback."
---

# Revision Phase 5: Commit, Push & Respond to PR

## Before you begin

1. **Read `state.md`** at `.ralph/tasks/{{ taskId }}/state.md`
2. **Verify the current phase** — this skill is for Revision Phase 5. If `state.md` shows a different current phase, update it now.
3. **Review "Tracked Identifiers"** — you need the branch name and PR URL.

## Instructions

### Pre-commit check

- Verify `npm run build` passes (or equivalent build command)
- Verify all feedback items from `state.md` have been addressed

### Commit & push

1. Stage only the files you changed: `git add <files>`
2. Commit with a message referencing the task: `git commit -m "docs(<area>): address review feedback for <TASK_ID> — <brief summary>"`
3. Push using the `ado_push_progress` MCP tool — do NOT use `git push` directly (do NOT create a new branch)

### Respond to PR threads

Using the ADO MCP tools:
1. **Reply to each review thread** with a brief explanation of what you changed — always start the reply with 🔧 so it's identifiable as Ralph
2. Set each addressed thread to **resolved** status
3. If a feedback item was intentionally NOT addressed, reply with 🔧 explaining why

## Before moving to Revision Phase 6

Update `state.md`:
- Set "Current Phase" to `Revision Phase 6: Update Handoff & Exit`
- Set "Skills for this phase" to:
  - ralph-workflow-revision-handoff
- Add Revision Phase 5 to "Completed Phases" with commit hash
