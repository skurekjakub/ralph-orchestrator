---
name: ralph-workflow-revision-fix
description: "Revision workflow Phase 3. Read this skill after understanding the feedback and locating the branch/PR. Covers implementing targeted fixes for each reviewer feedback item without restarting from scratch, preserving previous decisions, and validating builds."
---

# Revision Phase 3: Implement Fixes

## Before you begin

1. **Read `state.md`** at `.ralph/tasks/{{ taskId }}/state.md`
2. **Verify the current phase** — this skill is for Revision Phase 3. If `state.md` shows a different current phase, update it now.
3. **Review the "Feedback Items" section** — these are the specific issues to address.

## Phase 3: Implement Fixes

Fix the specific issues raised by the reviewer — do NOT restart from scratch:

1. **Address each feedback item** from the JIRA comments and PR threads
2. **Preserve previous decisions** unless explicitly contradicted by feedback
3. **Validate the build** with `npm run build` after each change — if it fails, consult the **ralph-build-errors** skill

{%- if triggerParams.skip_review %}

## Before moving to Revision Phase 5

Review was skipped for this task (`skip_review` parameter). Proceed directly to Revision Phase 5.

Update `state.md`:
- Set "Current Phase" to `Revision Phase 5: Commit & Respond`
- Set "Skills for this phase" to:
  - ralph-workflow-revision-commit
- Add Revision Phase 3 to "Completed Phases" with what was fixed
- Check off addressed feedback items

{%- else %}

## Before moving to Revision Phase 4

Update `state.md`:
- Set "Current Phase" to `Revision Phase 4: Review`
- Set "Skills for this phase" to:
  - ralph-workflow-review
- Add Revision Phase 3 to "Completed Phases" with what was fixed
- Check off addressed feedback items

{%- endif %}
