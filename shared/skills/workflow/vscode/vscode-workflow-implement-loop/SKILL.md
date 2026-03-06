---
name: vscode-workflow-implement-loop
description: "VS Code extension workflow Phase 3. Dispatch the coder and reviewer subagents in a loop, routing based on status.json. Maximum 2 iterations."
---

# Phase 3: Implement & Review Loop

## Before you begin

1. **Read `state.md`** at `.ralph/tasks/{{ taskId }}/state.md`
2. **Verify the current phase** — this skill is for Phase 3. If `state.md` shows a different current phase, update it now.
3. **Review completed phases** — confirm Phase 2 (Analyze) is done and the analyst produced a plan.

## Instructions

### Loop: coder → reviewer (max 2 iterations)

Track the current iteration number starting at 1.

#### Step 1: Dispatch the coder

Delegate to the `ralph-coder` sub-agent. It will:
- Read the analyst's plan from `.ralph/tasks/{{ taskId }}/artifacts/ralph-analyst/output.md`
- On iteration 2+, also read the reviewer's feedback from `.ralph/tasks/{{ taskId }}/artifacts/ralph-reviewer/output-v{N-1}.md`
- Implement the changes, run build/lint/test
- Write its change summary to `.ralph/tasks/{{ taskId }}/artifacts/ralph-coder/output-v{N}.md`
- Write status to `.ralph/tasks/{{ taskId }}/artifacts/ralph-coder/status.json`

Do not bother reading anz of the subagent outputs, the subagents will read the feedback themselves as appropriate.

#### Step 2: Read coder status

Read `.ralph/tasks/{{ taskId }}/artifacts/ralph-coder/status.json`.

| `result` | Action |
|---|---|
| `implemented` | Proceed to Step 3 (dispatch reviewer) |
| `partial` | **Exit loop** — skip review, proceed to Phase 4 with partial status |

Record the coder's `summary` in `state.md`.

#### Step 3: Dispatch the reviewer

Delegate to the `ralph-reviewer` sub-agent. It will:
- Read the coder's change summary from `.ralph/tasks/{{ taskId }}/artifacts/ralph-coder/output-v{N}.md`
- Read the analyst's plan for reference
- Read the actual changed files in the repo
- Run build/lint/test independently
- Write its review to `.ralph/tasks/{{ taskId }}/artifacts/ralph-reviewer/output-v{N}.md`
- Write status to `.ralph/tasks/{{ taskId }}/artifacts/ralph-reviewer/status.json`

#### Step 4: Read reviewer status

Read `.ralph/tasks/{{ taskId }}/artifacts/ralph-reviewer/status.json`.

| `result` | Iteration | Action |
|---|---|---|
| `pass` | any | **Exit loop** — proceed to Phase 4 |
| `fail` | < 2 | Increment iteration, go back to Step 1 |
| `fail` | = 2 | **Exit loop** — accept as-is, proceed to Phase 4 |

Record the reviewer's `summary` and verdict in `state.md`.

### After the loop

Note the final outcome in `state.md`:
- How many iterations ran
- Final reviewer verdict (or `partial` if coder couldn't complete)
- Whether the code is ready to commit

## Before moving to the next phase

Update `state.md`:
- Set "Current Phase" to the next phase listed in the workflow table (standard: `Phase 4: Package`, revision: `Revision Phase 4: Package`)
- Set "Skills for this phase" to:
  - vscode-workflow-package
- Keep the reminder line: `> ⚠️ STOP — Read every skill listed above BEFORE doing any work in this phase.`
- Add the implement & review phase to "Completed Phases" with iteration count and final status
