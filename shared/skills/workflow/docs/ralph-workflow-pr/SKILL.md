---
name: ralph-workflow-pr
description: "Standard workflow Phase 7. Read this skill after pushing your branch. Covers creating an ADO draft pull request via REST API, handling API errors gracefully, and recording the PR URL. Consult ralph-ado-pr-workflow for ADO-specific error handling and PR description format."
---

# Phase 7: Create Pull Request

## Before you begin

1. **Read `state.md`** at `.ralph/tasks/{{ taskId }}/state.md`
2. **Verify the current phase** — this skill is for Phase 7. If `state.md` shows a different current phase, update it now.
3. **Review completed phases** — confirm Phase 6 (Commit & Push) is done.

## Instructions

Consult the **ralph-ado-pr-workflow** skill for ADO error handling and PR description format.

Use the Azure DevOps REST API to create a draft PR for this branch.

- ADO repo: `kentico-docs-jekyll`
- Target branch: `{%- if triggerParams.source_branch %}{{ triggerParams.source_branch }}{%- else %}main{%- endif %}`
- Title: `{{ taskId }} - {{ taskTitle }}`

If the API returns an unrecoverable error, note it in the handoff and set the PR URL to "none" in the exit block.

## Before moving to Phase 8

Update `state.md`:
- Set "Current Phase" to `Phase 8: Handoff & Exit`
- Add Phase 7 to "Completed Phases" with PR URL or "none"
- Record PR URL in "Tracked Identifiers"
