{%- unless isRevision %}
# Phase 3: Write

## Before you begin

1. **Read `state.md`** at `.ralph/tasks/{{ taskId }}/state.md`
2. **Verify the current phase** — this skill is for Phase 3. If `state.md` shows a different current phase, update it now.
3. **Review completed phases** — confirm Phase 2 (Research) is complete.

## Instructions

Dispatch the **ralph-writer** sub-agent to implement the **next pending planned task**. The writer reads planner tasks and research artifacts directly from the filesystem — do not relay their contents.

### Dispatch

Invoke **ralph-writer** with:
- The task-id and a one-line directive (e.g. "Implement documentation changes for {{ taskId }}")

Do **not** pass research report content, task details, or source references. The writer reads planner and researcher artifacts on its own.

### After the writer returns

1. Read `status.json` at `.ralph/tasks/{{ taskId }}/artifacts/ralph-writer/status.json`
2. Record the writer's `result` and `summary` in `state.md`
3. Update "Current Task" with the task ID and title reported by the writer
4. If `result: partial`, record the blocker from `summary` for the handoff

{%- if triggerParams.skip_review %}

## Before moving to the next phase

Review using dedicated subagents is skipped for this task.

Update `state.md`:
- Add Phase 3 to "Completed Phases" with the writer's `result` and `summary` from `status.json`
- Record any new identifiers in "Tracked Identifiers"
- If `result: task-implemented`, append the current task to "Completed Tasks", clear "Current Task", and set "Current Phase" back to `Phase 3: Write`
- If `result: all-tasks-implemented`, append the current task to "Completed Tasks", clear "Current Task", and set "Current Phase" to `Phase 6: Commit & Push`
- If `result: partial`, set "Current Phase" to `Phase 6: Commit & Push`
- Note: "Phases 4-5 skipped (skip_review)"

{%- else %}

## Before moving to Phase 4

Update `state.md`:
- Set "Current Phase" to `Phase 4: Review`
- Add Phase 3 to "Completed Phases" with the writer's `result` and `summary` from `status.json`
- Record any new identifiers in "Tracked Identifiers"
- Keep "Current Task" set to the task reported by the writer until the review loop resolves it

{%- endif %}
{%- else %}
<!-- This file is for the standard workflow. You are running a revision workflow — this file is intentionally empty. -->
{%- endunless %}
