---
name: ralph-workflow-revision-fix
description: "Revision workflow Phases 3-4. Read this skill after understanding the feedback and locating the branch/PR. Covers implementing targeted fixes for each reviewer feedback item without restarting from scratch, preserving previous decisions, validating builds, and optionally delegating to ralph-reviewer for substantial changes."
---

# Revision Phase 3-4: Implement Fixes & Optional Review

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

## Phase 4: Review (SKIPPED)

Review was skipped for this task (`skip_review` parameter). Proceed directly to Revision Phase 5.

{%- else %}

## Phase 4: Review (Optional)

If the changes are substantial, delegate to the **ralph-reviewer** sub-agent for a quick check. For minor fixes (typos, small corrections), skip the review and proceed directly.

{%- endif %}

## Before moving to Revision Phase 5

Update `state.md`:
- Set "Current Phase" to `Revision Phase 5: Commit & Respond`
- Set "Skills for this phase" to:
  - ralph-workflow-revision-commit
- Add Revision Phase 3-4 to "Completed Phases" with what was fixed
- Check off addressed feedback items
