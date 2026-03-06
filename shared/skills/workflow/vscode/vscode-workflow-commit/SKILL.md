---
name: vscode-workflow-commit
description: "VS Code extension workflow Phase 3. Read this skill when implementation is done and you're ready to commit. Covers the pre-commit build check, staging, committing with the correct message format, and pushing via the ADO MCP tool."
---

# Phase 4: Commit & Push

## Before you begin

1. **Read `state.md`** at `.ralph/tasks/{{ taskId }}/state.md`
2. **Verify the current phase** — this skill is for Phase 4. If `state.md` shows a different current phase, update it now.
3. **Review completed phases** — confirm the implement & review loop is complete.

## Instructions

### Pre-commit check

- Run `npm run build` one final time to verify everything compiles
- Verify all changes address the JIRA issue requirements

### Commit & push

1. Stage only the files you changed: `git add <files>`
2. Commit with a descriptive message: `git commit -m "ralph/{{ taskId }}: <concise summary>"`
3. Push using the `ado_push_progress` MCP tool — do NOT use `git push` directly (do NOT create a new branch)

## Before moving to Phase 5

Update `state.md`:
- Set "Current Phase" to `Phase 5: Pull Request`
- Set "Skills for this phase" to:
  - vscode-workflow-pr
  - ralph-ado-pr-workflow
- Keep the reminder line: `> ⚠️ STOP — Read every skill listed above BEFORE doing any work in this phase.`
- Add Phase 4 to "Completed Phases" with commit hash
