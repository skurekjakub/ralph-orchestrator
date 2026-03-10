{%- unless isRevision %}
# Phase 2: Research (Sub-agent)

## Before you begin

1. **Read `state.md`** at `.ralph/tasks/{{ taskId }}/state.md`
2. **Verify the current phase** — this skill is for Phase 2. If `state.md` shows a different current phase, update it now.
3. **Review completed phases** — confirm you have the context from Phase 1.

## Instructions

Dispatch the **ralph-researcher** sub-agent with the and the JIRA issue details given in the initial prompt, ralphchives findings, and source code on its own.

After the researcher returns, read its `status.json` at `.ralph/tasks/{{ taskId }}/artifacts/ralph-researcher/status.json`.

- If `result: researched` — the research report is ready. Proceed to Phase 3.
- If `result: blocked` — record the `summary` in `state.md` and stop.

Do **not** read `ralph-researcher/output.md`. The writer reads it directly from the filesystem.

## Before moving to Phase 3

Update `state.md`:
- Set "Current Phase" to `Phase 3: Write`
- Add Phase 2 to "Completed Phases" with the researcher's `result` and `summary` from `status.json`
{%- else %}
<!-- This file is for the standard workflow. You are running a revision workflow — this file is intentionally empty. -->
{%- endunless %}
