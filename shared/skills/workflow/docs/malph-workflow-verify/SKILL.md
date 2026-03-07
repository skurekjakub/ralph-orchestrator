---
name: malph-workflow-verify
description: "Malph review workflow Phase 3. Read this skill after scouting the PR. Dispatch the technical reviewer and record its status.json result."
---

# Phase 3: Verify Technical Claims

## Before you begin

1. **Read `state.md`** at `.ralph/tasks/{{ taskId }}/state.md`
2. This skill is for **Phase 3: Verify Technical Claims**. If you've already completed this phase, skip to the next.

## Instructions

Dispatch the technical reviewer:

1. **Dispatch `ralph-reviewer-technical`** with the task-id and a one-line directive (e.g. "Review technical accuracy for {{ taskId }}"). The reviewer reads the scout's artifact and changed files directly from the filesystem.
2. After the reviewer returns, read its `status.json` at `.ralph/tasks/{{ taskId }}/artifacts/ralph-reviewer-technical/status.json`.
3. Record the `result` and `summary` in `state.md`.

Do **not** read `review-findings.json` or `output.md`. The verdict agent reads all reviewer findings.

## Before moving to Phase 4

Update `state.md`:
- Set "Current Phase" to `Phase 4: Review`
- Set "Skills for this phase" to:
  - malph-workflow-review
- Add Phase 3 to "Completed Phases"
- Record the technical reviewer's `result` and `summary` from `status.json` under "Technical Review Status"
