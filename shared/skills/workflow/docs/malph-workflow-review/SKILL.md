---
name: malph-workflow-review
description: "Malph review workflow Phase 5. Read this skill after the technical pass. Dispatch the remaining specialist reviewers, aggregate the scout and reviewer findings, and determine the final panel verdict."
---

# Phase 5: Review

## Before you begin

1. **Read `state.md`** at `.ralph/tasks/{{ taskId }}/state.md`
2. This skill is for **Phase 5: Review**. If you've already completed this phase, skip to the next.
3. **Check "Scout Findings"** and **"Technical Findings"** in `state.md` — you need both for aggregation.

## Instructions

Dispatch and aggregate the remaining review panel:

1. **Dispatch `ralph-reviewer-style`** with the changed-file context and scout findings.
2. **Dispatch `ralph-reviewer-ia`** with the changed-file context and scout findings.
3. Read `review-findings.json` from the technical, style, and IA reviewers.
4. Read `scout-findings.json` from `malph-scout`.
5. Combine those findings with the scout's requirement-coverage notes.

### Verdict rules

Apply the verdict **mechanically**:

- **NEEDS REVISION** if:
  - the scout found a blocking requirement gap or build failure
  - any reviewer returned `needs-revision`
  - any surviving finding is `REQ-XXX`, `ACC-XXX`, `STY-XXX`, or `IA-XXX`
- **APPROVED** only if the scout found no blocking gaps and all three reviewers returned `approved`

`SUG-XXX` findings are the only non-blocking category.

## Before moving to Phase 6

Update `state.md`:
- Set "Current Phase" to `Phase 6: Deliver`
- Set "Skills for this phase" to:
  - malph-workflow-deliver
- Add Phase 5 to "Completed Phases"
- Record your verdict (APPROVED or NEEDS REVISION) and all findings under "Review Findings" — use issue codes (`STY-XXX`, `ACC-XXX`, `REQ-XXX`, `IA-XXX`, `SUG-XXX`)
