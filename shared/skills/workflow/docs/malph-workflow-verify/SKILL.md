---
name: malph-workflow-verify
description: "Malph review workflow Phase 4. Read this skill after scouting the PR. Dispatch the technical reviewer, preserve its findings, and carry the result into the panel aggregation step."
---

# Phase 4: Verify Technical Claims

## Before you begin

1. **Read `state.md`** at `.ralph/tasks/{{ taskId }}/state.md`
2. This skill is for **Phase 4: Verify Technical Claims**. If you've already completed this phase, skip to the next.

## Instructions

Before the panel aggregates its verdict, run the technical pass:

1. **Dispatch `ralph-reviewer-technical`** with the changed-file context and scout findings.
2. **Validate the reviewer result** — it must return a verdict plus structured findings in `review-findings.json`.
3. **Corroborate with Microsoft documentation** when the technical reviewer identifies platform-specific claims that need extra validation.
4. **Preserve source URLs** from the technical review findings — you'll need them in Phase 6 for the JIRA comment.

## Before moving to Phase 5

Update `state.md`:
- Set "Current Phase" to `Phase 5: Review`
- Set "Skills for this phase" to:
  - malph-workflow-review
- Add Phase 4 to "Completed Phases"
- Record the technical review result under "Technical Findings"
- Note any corroborating or conflicting info from Microsoft docs
