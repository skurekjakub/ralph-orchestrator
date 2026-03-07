---
name: devralph-workflow-implement
description: "Phase 3 of the standard development workflow — dispatch the stacky-coder sub-agent to execute the implementation plan from Phase 2 and return a validated change set for the QA phases."
---
{% raw %}

# Phase 3: Implement

## Before you begin

1. **Read `state.md`** — confirm you're in Phase 3. Read your Implementation Plan.
2. Read domain skills for the affected components (listed in `state.md`).

## Instructions

1. **Dispatch `stacky-coder`** with the analyst plan and the relevant domain-skill context.

2. **Validate the coder result** — confirm it returned:
   - Files modified/created
   - Build status
   - Any Ruby-test status it ran inline
   - Notes about deviations or blockers

3. **Update `state.md`** — record the coder iteration, files changed, and any deviations from the plan.

## Before moving to Phase 4

Update `state.md`:
- Set "Current Phase" to `Phase 4: Test`
- Set "Skills for this phase" to:
  - devralph-workflow-test
- Add Phase 3 to "Completed Phases" with the coder iteration result and summary of changes made
- List all files modified/created
- Confirm the coder reported a passing build

{% endraw %}
