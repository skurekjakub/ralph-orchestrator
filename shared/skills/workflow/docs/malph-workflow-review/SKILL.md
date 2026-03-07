---
name: malph-workflow-review
description: "Malph review workflow Phase 4. Read this skill after the technical pass. Dispatch the remaining specialist reviewers and determine the panel verdict mechanically from status.json results."
---

# Phase 4: Review

## Before you begin

1. **Read `state.md`** at `.ralph/tasks/{{ taskId }}/state.md`
2. This skill is for **Phase 4: Review**. If you've already completed this phase, skip to the next.
3. **Check "Technical Review Status"** in `state.md` — confirm Phase 4 is complete.

## Instructions

Dispatch the remaining reviewers:

1. **Dispatch `ralph-reviewer-style`** with the task-id and a one-line directive (e.g. "Review style compliance for {{ taskId }}"). The reviewer reads the writer's artifact and changed files directly from the filesystem.
2. **Dispatch `ralph-reviewer-ia`** with the task-id and a one-line directive (e.g. "Review information architecture for {{ taskId }}"). The reviewer reads the changed files and their neighborhood directly from the filesystem.
3. After both return, read their `status.json` files.

Do **not** read `review-findings.json`, `scout-findings.json`, or `output.md`. The verdict agent reads all findings.

### Verdict determination

Determine the panel verdict **mechanically** from `status.json` results only:

- **NEEDS REVISION** if:
  - the scout returned `build-broken` (from Phase 2)
  - any reviewer returned `result: needs-revision`
- **APPROVED** only if the scout found no blocking gaps and all three reviewers returned `result: approved`

Record the verdict in `state.md`. This is a routing decision, not a content judgment.

## Before moving to Phase 5

Update `state.md`:
- Set "Current Phase" to `Phase 5: Deliver`
- Set "Skills for this phase" to:
  - malph-workflow-deliver
- Add Phase 4 to "Completed Phases"
- Record the panel verdict (APPROVED or NEEDS REVISION) and each reviewer's `result` from `status.json` under "Review Panel Status" and "Panel Verdict"