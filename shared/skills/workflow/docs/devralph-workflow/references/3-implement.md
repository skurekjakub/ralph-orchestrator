{%- unless isRevision %}
{% raw %}

# Phase 3: Implement

## Before you begin

1. **Read `state.md`** — confirm you're in Phase 3. Read your Implementation Plan.
2. Read domain skills for the affected components (listed in `state.md`).

## Instructions

1. **Dispatch `stacky-coder`** with the analyst plan and the relevant domain-skill context.

2. **Read the coder's `status.json`** at `.ralph/tasks/{{ taskId }}/artifacts/stacky-coder/status.json`. Route on the `result` field:
   - `implemented` → proceed to Phase 4
   - `partial` → skip QA and proceed to commit with partial status

3. **Update `state.md`** — record the coder iteration number, `result`, and `summary` from `status.json`.

## Before moving to Phase 4

Update `state.md`:
- Set "Current Phase" to `Phase 4: Test`
- Set "Reference file for this phase" to `references/4-test.md`
- Add Phase 3 to "Completed Phases" with the coder's `result` and `summary` from `status.json`

{% endraw %}
{%- else %}
<!-- This file is for the standard workflow. You are running a revision workflow — this file is intentionally empty. -->
{%- endunless %}
