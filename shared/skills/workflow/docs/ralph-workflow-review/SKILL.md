---
name: ralph-workflow-review
description: "Standard workflow Phases 4-5. Read this skill after implementing changes and before committing. Covers delegating to three specialized reviewer sub-agents (technical accuracy, style & grammar, information architecture), aggregating their verdicts, and running the revision loop (max 2 cycles). Unanimous approval from all three reviewers is required to proceed normally. After 2 revision cycles without full approval, proceed to Phase 6 and record a 'Not converged' outcome for each non-approving reviewer in the handoff."
---

# Phase 4: Review (Three-Reviewer Gate)

## Before you begin

1. **Read `state.md`** at `.ralph/tasks/{{ taskId }}/state.md`
2. **Verify the current phase** — this skill is for Phase 4. If `state.md` shows a different current phase, update it now.
3. **Review completed phases** — confirm Phase 3 (Write) is complete with a passing build.

## Instructions

Delegate to **all three** reviewer sub-agents. Each reviewer reads the writer's artifact and the repo diff directly from the filesystem. Aggregate only their `status.json` verdicts.

| Sub-agent | Responsibility | Verdict codes |
|---|---|---|
| **ralph-reviewer-technical** | Technical accuracy — verifies claims against Xperience source code | `ACC-XXX` |
| **ralph-reviewer-style** | Style guide compliance & grammar — verifies against style guide and syntax standards | `STY-XXX` |
| **ralph-reviewer-ia** | Information architecture — evaluates fit within existing docs structure | `IA-XXX` |

### Invocation

Invoke each reviewer as a subagent with the task-id and a one-line directive (e.g. "Review documentation changes for {{ taskId }}"). Each reviewer reads the writer's artifact and the actual changed files directly from the filesystem. Collect all three verdicts before deciding.

If this is a revision review, tell each reviewer so they apply revision-mode leniency.

### Aggregation

**All three must return APPROVED.** If ANY reviewer returns NEEDS REVISION, the overall verdict is NEEDS REVISION.

After collecting all three verdicts:
1. **All APPROVED** → proceed to Phase 6 (skip Phase 5)
2. **Any NEEDS REVISION** → enter Phase 5 (Revision Loop). The writer reads the failing reviewers' artifacts from the filesystem on its own.

### Aggregation rule

You do not re-review the documentation. Route mechanically on the reviewer results:

- If all reviewers approve, proceed
- If any reviewer requests revision, send the task back to `ralph-writer`
- If a reviewer artifact is malformed or missing, re-dispatch that reviewer once before proceeding

## Phase 5: Revision Loop (Max 2 cycles)

If any reviewer returns **NEEDS REVISION**:

1. **Cycle 1:** Re-dispatch **ralph-writer** with the task-id and a one-line directive (e.g. "Address reviewer feedback for {{ taskId }}"). The writer reads the failing reviewer artifacts directly from the artifact directory, fixes the issues, and re-runs the build. Then re-invoke **only the reviewer(s) that returned NEEDS REVISION** — do not re-invoke reviewers that already APPROVED.
2. **Cycle 2:** If still not fully approved, re-dispatch the writer one final time. After this, do NOT review again — proceed to Phase 6 and note in the handoff which reviewer(s) did not converge.

If all reviewers return **APPROVED** at any point, skip remaining cycles and proceed to Phase 6.

**Important:** During revision cycles, only re-invoke the failing reviewer(s). A reviewer that already returned APPROVED does not need to re-review unless your fixes touched areas outside the original feedback (which should be rare).

## Before moving to Phase 6

Update `state.md`:
- Set "Current Phase" to `Phase 6: Commit & Push`

- Add Phase 4-5 to "Completed Phases" with review outcome per reviewer:
  - Technical: Approved / Approved after N cycles / Not converged
  - Style: Approved / Approved after N cycles / Not converged
  - IA: Approved / Approved after N cycles / Not converged
