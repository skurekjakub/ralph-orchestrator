---
name: malph-workflow-deliver
description: "Malph review workflow Phase 5. Read this skill after the review panel. Dispatch malph-verdict to aggregate findings, post the JIRA comment, and post PR threads."
---

# Phase 5: Deliver Judgment

## Before you begin

1. **Read `state.md`** at `.ralph/tasks/{{ taskId }}/state.md`
2. This skill is for **Phase 5: Deliver**. If you've already completed this phase, skip to the next.
3. **Check the panel verdict** in `state.md` — confirm Phase 4 is complete and the verdict is recorded.

## Instructions

1. **Dispatch `malph-verdict`** with the task-id and a one-line directive (e.g. "Deliver verdict for {{ taskId }}"). The verdict agent reads all scout and reviewer findings from the artifact directory, composes the JIRA comment, posts PR threads, and writes the review handoff.
2. After the verdict agent returns, read its `status.json` at `.ralph/tasks/{{ taskId }}/artifacts/malph-verdict/status.json`.
3. Record the `result` (`approved` or `needs-revision`) and `summary` in `state.md` under "Verdict Delivery Status".

Do **not** read `review-findings.json`, `scout-findings.json`, or `output.md`. Do **not** compose or post JIRA comments or PR threads yourself — that is the verdict agent's job.

## Before moving to Phase 6

Update `state.md`:
- Set "Current Phase" to `Phase 6: Handoff & Exit`
- Set "Skills for this phase" to:
  - malph-workflow-handoff
- Add Phase 5 to "Completed Phases" — note the verdict agent's `result` and `summary` from `status.json`
