{%- unless isRevision %}
# Phase 2: Research (Sub-agent)

## Before you begin

1. **Read `state.md`** at `.ralph/tasks/{{ taskId }}/state.md`
2. **Verify the current phase** — this skill is for Phase 2. If `state.md` shows a different current phase, update it now.
3. **Review completed phases** — confirm you have the context from Phase 1.

## Instructions

Dispatch the **ralph-researcher** sub-agent with the JIRA issue details given in the initial prompt, ralphchives findings, and source code context on its own.

### Re-run Context

If this is a **re-run** of a previously attempted task (prior PR exists, prior handoff exists, or `state.md` references a previous attempt), include the following in the researcher dispatch prompt so it doesn't have to rediscover this context via ralphchives:
- Prior PR number(s) and their status (merged, abandoned, superseded)
- One-line summary of what the prior attempt accomplished or where it fell short
- Any branch dependency information (e.g., "depends on DOC-XXXX / PR #YYYY being merged first")

This saves the researcher ~10 tool calls on ralphchives queries that would only rediscover what you already know from `state.md` or Phase 1 setup.

After the researcher returns, read its `status.json` at `.ralph/tasks/{{ taskId }}/artifacts/ralph-researcher/status.json`.

- If `result: researched` — dispatch **ralph-planner** with a one-line directive (e.g. "Break research into headless execution tasks for {{ taskId }}").
- Then read `status.json` at `.ralph/tasks/{{ taskId }}/artifacts/ralph-planner/status.json`.
- If `result: planned` — task files are ready. Proceed to Phase 3.
- If the planner returns `result: blocked`, record its `summary` in `state.md` and stop.
- If the researcher returns `result: blocked`, record its `summary` in `state.md` and stop.

Do **not** read `ralph-researcher/output.md` or planner task artifacts. The planner and writer read them directly from the filesystem.

## Before moving to Phase 3

Update `state.md`:
- Set "Current Phase" to `Phase 3: Write`
- Add Phase 2 to "Completed Phases" with the researcher's and planner's `result` and `summary` from `status.json`
- Update "Task Plan" with the planner summary and the path to `ralph-planner/tasks.json`
- Set "Current Task" to `controlled by ralph-planner/tasks.json`
{%- else %}
<!-- This file is for the standard workflow. You are running a revision workflow — this file is intentionally empty. -->
{%- endunless %}
