---
name: ralph-workflow-write
description: "Standard workflow Phase 3. Read this skill when you're ready to dispatch the writer sub-agent. Invoke ralph-writer with the task-id, read its status.json, and prepare the review phase."
---

# Phase 3: Write

## Before you begin

1. **Read `state.md`** at `.ralph/tasks/{{ taskId }}/state.md`
2. **Verify the current phase** — this skill is for Phase 3. If `state.md` shows a different current phase, update it now.
3. **Review completed phases** — confirm Phase 2 (Research) is complete.

## Instructions

Dispatch the **ralph-writer** sub-agent to implement all documentation changes. The writer reads the researcher's artifact directly from the filesystem — do not relay research content.

### Dispatch

Invoke **ralph-writer** with:
- The task-id and a one-line directive (e.g. "Implement documentation changes for {{ taskId }}")
- Any task-level constraints that apply:
  - scope restriction (if `triggerParams.scope` is set)
  - code-sample involvement (if `triggerParams.codesamples` is set)
  - release-notes requirement (if `triggerParams.release_notes` is set)

Do **not** pass research report content, subtask lists, or source references. The writer reads `ralph-researcher/output.md` on its own.

### After the writer returns

1. Read `status.json` at `.ralph/tasks/{{ taskId }}/artifacts/ralph-writer/status.json`
2. Record the `result` and `summary` in `state.md`
3. If `result: partial`, record the blocker from `summary` for the handoff

{%- if triggerParams.skip_review %}

## Before moving to Phase 6

Review using dedicated subagent is skipped for this task. Proceed directly to Phase 6: Commit & Push.

Update `state.md`:
- Set "Current Phase" to `Phase 6: Commit & Push`
- Set "Skills for this phase" to:
  - ralph-workflow-commit
- Keep the reminder line: `> ⚠️ STOP — Read every skill listed above BEFORE doing any work in this phase.`
- Add Phase 3 to "Completed Phases" with the writer's `result` and `summary` from `status.json`
- Record any new identifiers in "Tracked Identifiers"
- Note: "Phases 4-5 skipped (skip_review)"

{%- else %}

## Before moving to Phase 4

Update `state.md`:
- Set "Current Phase" to `Phase 4: Review`
- Set "Skills for this phase" to:
  - ralph-workflow-review
- Keep the reminder line: `> ⚠️ STOP — Read every skill listed above BEFORE doing any work in this phase.`
- Add Phase 3 to "Completed Phases" with the writer's `result` and `summary` from `status.json`
- Record any new identifiers in "Tracked Identifiers"

{%- endif %}
