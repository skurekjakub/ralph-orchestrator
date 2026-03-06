---
name: vscode-workflow-pr
description: "VS Code extension workflow Phase 4. Read this skill after pushing your branch. Covers creating an ADO draft pull request via the MCP tool, handling errors gracefully, and recording the PR URL."
---

# Phase 5: Create Pull Request

## Before you begin

1. **Read `state.md`** at `.ralph/tasks/{{ taskId }}/state.md`
2. **Verify the current phase** — this skill is for Phase 5. If `state.md` shows a different current phase, update it now.
3. **Review completed phases** — confirm Phase 4 (Commit & Push) is done.

## Instructions

Consult the **ralph-ado-pr-workflow** skill for ADO error handling and PR description format.

Use the `ado_create_pull_request` MCP tool to create a draft PR.

- Target branch: `main`
- Title: `{{ taskId }} - {{ taskTitle }}`

If the API returns an unrecoverable error, note it in the handoff and set the PR URL to "none" in the exit block.

## Before moving to Phase 6

Update `state.md`:
- Set "Current Phase" to `Phase 6: Handoff`
- Set "Skills for this phase" to:
  - vscode-workflow-handoff
- Keep the reminder line: `> ⚠️ STOP — Read every skill listed above BEFORE doing any work in this phase.`
- Add Phase 5 to "Completed Phases" with PR URL or "none"
- Record PR URL in "Tracked Identifiers"
