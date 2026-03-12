{%- if isRevision %}
# Revision Phase 5: Commit, Push & Respond to PR

## Before you begin

1. **Read `state.md`** at `.ralph/tasks/{{ taskId }}/state.md`
2. **Verify the current phase** — this skill is for Revision Phase 5. If `state.md` shows a different current phase, update it now.
3. **Review "Tracked Identifiers"** — you need the branch name and PR URL.

## Instructions

### Pre-commit check

- Verify the latest writer iteration reported `result: all-tasks-implemented` (or that the task is intentionally partial)
- Verify all planned revision tasks were completed or explicitly deferred
- Verify all feedback items from `state.md` have been addressed

### Commit & push

1. Stage only the files you changed: `git add <files>`
2. Commit with a message referencing the task and the Ralph commit prefix conventions already recorded in `state.md`
3. Push using the `ado_push_progress` MCP tool — do NOT use `git push` directly (do NOT create a new branch)

### Respond to PR threads

Using the ADO MCP tools:
1. **Reply to each review thread** with a brief explanation of what you changed — always start the reply with 🔧 so it's identifiable as Ralph
2. Set each addressed thread to **resolved** status
3. If a feedback item was intentionally NOT addressed, reply with 🔧 explaining why

## Before moving to Revision Phase 6

Update `state.md`:
- Set "Current Phase" to `Revision Phase 6: Handoff & Exit`
- Add Revision Phase 5 to "Completed Phases" with commit hash
{%- else %}
<!-- This file is for the revision workflow. You are running a standard workflow — this file is intentionally empty. -->
{%- endif %}
