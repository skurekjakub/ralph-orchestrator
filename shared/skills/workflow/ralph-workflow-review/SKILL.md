---
name: ralph-workflow-review
description: "Standard workflow Phases 4-5. Read this skill after implementing changes and before committing. Covers delegating to the ralph-reviewer sub-agent, handling APPROVED vs NEEDS REVISION outcomes, and running the revision loop (max 2 cycles). If review doesn't converge after 2 cycles, proceed anyway and note it in the handoff."
---

# Phase 4: Review (Sub-agent)

## Before you begin

1. **Read `state.md`** at `.ralph/tasks/{{ taskId }}/state.md`
2. **Verify the current phase** — this skill is for Phase 4. If `state.md` shows a different current phase, update it now.
3. **Review completed phases** — confirm Phase 3 (Write) is complete with a passing build.

## Instructions

Delegate to the **ralph-reviewer** sub-agent:
- Pass a summary of your changes (file paths, what changed, key decisions)
- The reviewer checks style guide compliance, technical accuracy, and content quality
- It returns either **APPROVED** or **NEEDS REVISION** with specific feedback

**Trust but verify.** If the reviewer flags something, verify the claim is valid before acting on it — don't blindly revert correct work based on a false positive. Conversely, an APPROVED result doesn't guarantee perfection — use your own judgment on anything that feels off.

## Phase 5: Revision Loop (Max 2 cycles)

If the reviewer returns **NEEDS REVISION**:

1. **Cycle 1:** Fix the listed issues yourself. Run `npm run build` to validate. Send back to **ralph-reviewer** for re-review.
2. **Cycle 2:** If still not approved, fix one final time. After this, do NOT review again — proceed to Phase 6 and note in the handoff that review convergence was not reached.

If the reviewer returns **APPROVED** at any point, skip remaining cycles and proceed to Phase 6.

## Before moving to Phase 6

Update `state.md`:
- Set "Current Phase" to `Phase 6: Commit & Push`
- Set "Skills for this phase" to:
  - ralph-workflow-commit
- Keep the reminder line: `> ⚠️ STOP — Read every skill listed above BEFORE doing any work in this phase.`
- Add Phase 4-5 to "Completed Phases" with review outcome (Approved / Approved after N cycles / Not converged)
