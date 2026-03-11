{%- if isRevision %}
# Revision Phase 5: Commit, Push & Respond to PR

## Before you begin

1. **Read `state.md`** at `.ralph/tasks/{{ taskId }}/state.md`
2. **Verify the current phase** — this reference is for Revision Phase 5.
3. **Review "Tracked Identifiers"** — you need the branch name and PR ID.
4. **Review completed phases** — confirm Package is complete.

## Instructions

### Pre-commit check

- Run `npm run build` one final time to verify everything compiles
- Verify all feedback items from `state.md` have been addressed

### Commit & push

1. Stage only the files you changed: `git add <files>`
2. Commit with a message referencing the task: `git commit -m "ralph/{{ taskId }}: address review feedback"`
3. Push using the `ado_push_progress` MCP tool — do NOT use `git push` directly (do NOT create a new branch)

### Respond to PR threads

Using the ADO MCP tools:
1. **Reply to each review thread** with a brief explanation of what you changed — always start the reply with 🔧 so it's identifiable as Ralph
2. Set each addressed thread to **resolved** status
3. If a feedback item was intentionally NOT addressed, reply with 🔧 explaining why

## Before moving to Revision Phase 6

Update `state.md`:
- Set "Current Phase" to `Revision Phase 6: Handoff`
- Set "Reference file for this phase" to `references/r6-handoff.md`
- Add Revision Phase 5 to "Completed Phases" with commit hash
{%- else %}
<!-- This file is for the revision workflow. You are running a standard workflow — see references/5-commit.md instead. -->
{%- endif %}
