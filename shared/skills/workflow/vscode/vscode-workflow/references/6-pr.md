{%- unless isRevision %}
# Phase 6: Create Pull Request

## Before you begin

1. **Read `state.md`** at `.ralph/tasks/{{ taskId }}/state.md`
2. **Verify the current phase** — this reference is for Phase 6.
3. **Review completed phases** — confirm Commit & Push is done.

## Instructions

Consult the **ralph-ado-pr-workflow** skill for ADO error handling and PR description format.

Use the `ado_create_pull_request` MCP tool to create a draft PR.

- Target branch: `main`
- Title: `{{ taskId }} - {{ taskTitle }}`

If the API returns an unrecoverable error, note it in the handoff and set the PR URL to "none" in the exit block.

## Before moving to Phase 7

Update `state.md`:
- Set "Current Phase" to `Phase 7: Handoff`
- Set "Reference file for this phase" to `references/7-handoff.md`
- Keep the reminder line
- Add Phase 6 to "Completed Phases" with PR URL or "none"
- Record PR URL in "Tracked Identifiers"
{%- else %}
<!-- This file is for the standard workflow. You are running a revision workflow — PR already exists. -->
{%- endunless %}
