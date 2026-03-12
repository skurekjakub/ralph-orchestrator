{%- unless isRevision %}
# Phase 5: Commit & Push

## Before you begin

1. **Read `state.md`** at `.ralph/tasks/{{ taskId }}/state.md`
2. **Verify the current phase** — this reference is for Phase 5.
3. **Review completed phases** — confirm Package is complete.

## Instructions

### Pre-commit check

- Run `npm run build` one final time to verify everything compiles
- Verify all changes address the JIRA issue requirements

### Commit & push

1. Stage all changed files including the `.vsix` binary: `git add <files> *.vsix`
2. Commit with a descriptive message: `git commit -m "ralph/{{ taskId }}: <concise summary>"`
3. Push using the `ado_push_progress` MCP tool — do NOT use `git push` directly (do NOT create a new branch)

## Before moving to Phase 6

Update `state.md`:
- Set "Current Phase" to `Phase 6: Pull Request`
- Set "Reference file for this phase" to `references/6-pr.md`
- Keep the reminder line
- Add Phase 5 to "Completed Phases" with commit hash
{%- else %}
<!-- This file is for the standard workflow. You are running a revision workflow — see references/r5-commit.md instead. -->
{%- endunless %}
