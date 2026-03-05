---
name: ralph-workflow-review
description: "Standard workflow Phases 4-5. Read this skill after implementing changes and before committing. Covers delegating to three specialized reviewer sub-agents (technical accuracy, style & grammar, information architecture), aggregating their verdicts, and running the revision loop (max 2 cycles). All three reviewers must APPROVE before proceeding. If review doesn't converge after 2 cycles, proceed anyway and note it in the handoff."
---

# Phase 4: Review (Three-Reviewer Gate)

## Before you begin

1. **Read `state.md`** at `.ralph/tasks/{{ taskId }}/state.md`
2. **Verify the current phase** — this skill is for Phase 4. If `state.md` shows a different current phase, update it now.
3. **Review completed phases** — confirm Phase 3 (Write) is complete with a passing build.

## Instructions

Delegate to **all three** reviewer sub-agents. Each reviewer covers one dimension — pass the same summary of your changes (file paths, what changed, key decisions) to each one:

| Sub-agent | Responsibility | Verdict codes |
|---|---|---|
| **ralph-reviewer-technical** | Technical accuracy — verifies claims against Xperience source code | `ACC-XXX` |
| **ralph-reviewer-style** | Style guide compliance & grammar — verifies against style guide and syntax standards | `STY-XXX` |
| **ralph-reviewer-ia** | Information architecture — evaluates fit within existing docs structure | `IA-XXX` |

### Invocation

Invoke each reviewer as subagent. Collect all three verdicts before deciding.

For each reviewer, include:
- The list of changed/created file paths
- A brief summary of what changed and why
- Whether this is a revision review (if applicable — tell them so they apply revision-mode leniency)

### Aggregation

**All three must return APPROVED.** If ANY reviewer returns NEEDS REVISION, the overall verdict is NEEDS REVISION.

After collecting all three verdicts:
1. **All APPROVED** → proceed to Phase 6 (skip Phase 5)
2. **Any NEEDS REVISION** → enter Phase 5 (Revision Loop) with the combined feedback from all reviewers that flagged issues

### Trust but verify

If a reviewer flags something, verify the claim is valid before acting on it — don't blindly revert correct work based on a false positive. This is especially important for:
- **Technical reviewer** — source code search can miss or misidentify APIs; double-check the evidence URLs
- **Style reviewer** — ensure cited rules actually exist in the style guide skills
- **IA reviewer** — structural suggestions may be valid observations but not actionable within the current PR's scope

Conversely, an APPROVED result doesn't guarantee perfection — use your own judgment on anything that feels off.

## Phase 5: Revision Loop (Max 2 cycles)

If any reviewer returns **NEEDS REVISION**:

1. **Cycle 1:** Fix the listed issues yourself. Run `npm run build` to validate. Re-invoke **only the reviewer(s) that returned NEEDS REVISION** — do not re-invoke reviewers that already APPROVED.
2. **Cycle 2:** If still not fully approved, fix one final time. After this, do NOT review again — proceed to Phase 6 and note in the handoff which reviewer(s) did not converge.

If all reviewers return **APPROVED** at any point, skip remaining cycles and proceed to Phase 6.

**Important:** During revision cycles, only re-invoke the failing reviewer(s). A reviewer that already returned APPROVED does not need to re-review unless your fixes touched areas outside the original feedback (which should be rare).

## Before moving to Phase 6

Update `state.md`:
- Set "Current Phase" to `Phase 6: Commit & Push`
- Set "Skills for this phase" to:
  - ralph-workflow-commit
- Keep the reminder line: `> ⚠️ STOP — Read every skill listed above BEFORE doing any work in this phase.`
- Add Phase 4-5 to "Completed Phases" with review outcome per reviewer:
  - Technical: Approved / Approved after N cycles / Not converged
  - Style: Approved / Approved after N cycles / Not converged
  - IA: Approved / Approved after N cycles / Not converged
