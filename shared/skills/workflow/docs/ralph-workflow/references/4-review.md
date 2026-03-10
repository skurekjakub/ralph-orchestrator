# Phase 4: Review (Three-Reviewer Gate)

## Before you begin

1. **Read `state.md`** at `.ralph/tasks/{{ taskId }}/state.md`
2. **Verify the current phase** — this skill is for Phase 4. If `state.md` shows a different current phase, update it now.
3. **Review completed phases** — confirm Phase 3 (Write) completed a task with a passing build.
4. **Read the current task** in `state.md` — reviewers are auditing that task only.

## Instructions

Delegate to **all three** reviewer sub-agents. Each reviewer reads the planner task file, the writer's latest artifact, and the task's actual changed files directly from the filesystem. Aggregate only their `status.json` verdicts.

| Sub-agent | Responsibility | Verdict codes |
|---|---|---|
| **ralph-reviewer-technical** | Technical accuracy — verifies claims against Xperience source code | `ACC-XXX` |
| **ralph-reviewer-style** | Style guide compliance & grammar — verifies against style guide and syntax standards | `STY-XXX` |
| **ralph-reviewer-ia** | Information architecture — evaluates fit within existing docs structure | `IA-XXX` |

### Invocation

Invoke each reviewer as a subagent with the task-id and a one-line directive (e.g. "Review the current planned task for {{ taskId }}"). Each reviewer reads the current planner task, the writer's artifact, and the actual changed files directly from the filesystem. Collect all three verdicts before deciding.

If this is a revision review, tell each reviewer so they apply revision-mode leniency.

### Aggregation

**All three must return APPROVED for the current task.** If ANY reviewer returns NEEDS REVISION, the overall verdict for the current task is NEEDS REVISION.

After collecting all three verdicts:
1. **All APPROVED and the latest writer result was `task-implemented`** → mark the current task complete and return to Phase 3 for the next pending task
2. **All APPROVED and the latest writer result was `all-tasks-implemented`** → mark the current task complete and proceed to Phase 6
3. **Any NEEDS REVISION** → enter Phase 5 (Revision Loop). The writer reads the failing reviewers' artifacts from the filesystem on its own.

### Aggregation rule

You do not re-review the documentation. Route mechanically on the reviewer results:

- If all reviewers approve, proceed
- If any reviewer requests revision, send the task back to `ralph-writer`
- If a reviewer artifact is malformed or missing, re-dispatch that reviewer once before proceeding

## Phase 5: Revision Loop (Max 3 cycles)

If any reviewer returns **NEEDS REVISION**:

1. **Cycle 1:** Re-dispatch **ralph-writer** with the task-id and a one-line directive (e.g. "Address reviewer feedback for the current task in {{ taskId }}"). The writer reads the failing reviewer artifacts directly from the artifact directory, fixes the current task, and re-runs the build. Then re-invoke **only the reviewer(s) that returned NEEDS REVISION** — do not re-invoke reviewers that already APPROVED.
2. **Cycle 2:** If still not fully approved, re-dispatch the writer again and re-run only the reviewer(s) still failing.
3. **Cycle 3:** If reviewers still do not fully approve, run one final writer revision round for the same task. After this, do NOT review again — proceed onward and note in `state.md` which reviewer(s) did not converge for that task.

If all reviewers return **APPROVED** at any point, skip remaining cycles and route based on the latest writer result:
- `task-implemented` → return to Phase 3 for the next task
- `all-tasks-implemented` → proceed to Phase 6

**Important:** During revision cycles, only re-invoke the failing reviewer(s). A reviewer that already returned APPROVED does not need to re-review unless the writer made broader changes outside the original feedback.

## Before moving to the next phase

Update `state.md`:
- Add Phase 4-5 to "Completed Phases" with review outcome per reviewer for the current task:
  - Technical: Approved / Approved after N cycles / Not converged
  - Style: Approved / Approved after N cycles / Not converged
  - IA: Approved / Approved after N cycles / Not converged
- If the task was approved, append it to "Completed Tasks"
- If more planned tasks remain, clear "Current Task" and set "Current Phase" to `Phase 3: Write`
- If the final task was approved, clear "Current Task" and set "Current Phase" to `Phase 6: Commit & Push`
- If the task did not converge but work should still ship, set "Current Phase" to `Phase 6: Commit & Push` and note the non-converged reviewers
