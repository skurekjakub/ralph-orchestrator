{%- unless isRevision %}

# Phase 2: Research

## Before you begin

1. **Read `state.md`** — confirm you're in Phase 2.
2. Read domain skills listed in `state.md` — these contain architecture knowledge for the affected components.

## Instructions

1. **Read the JIRA issue carefully** — identify exactly what needs to change and what the acceptance criteria are.

2. **Dispatch `stacky-analyst`** with the issue details, the current branch context, and any relevant domain-skill hints.

3. **Read the analyst's `status.json`** at `.ralph/tasks/{{ taskId }}/artifacts/stacky-analyst/status.json`. Route on the `result` field:
   - `analyzed` → proceed to Phase 3
   - `blocked` → stop with overall status `blocked`

4. **Update `state.md`** — record the analyst's `summary` from `status.json` under "Source References" and note the analysis is complete. The detailed implementation plan lives in the analyst's artifacts — the coder reads it directly in Phase 3.

## Before moving to Phase 3

Update `state.md`:
- Set "Current Phase" to `Phase 3: Implement`
- Set "Reference file for this phase" to `references/3-implement.md`
  - Also list domain skills for the affected components
- Add Phase 2 to "Completed Phases" with key findings

{%- else %}
<!-- This file is for the standard workflow. You are running a revision workflow — this file is intentionally empty. -->
{%- endunless %}
