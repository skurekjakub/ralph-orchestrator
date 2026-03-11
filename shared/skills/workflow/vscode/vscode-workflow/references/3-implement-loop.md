# Phase 3: Implement & Review Loop

## Before you begin

1. **Read `state.md`** at `.ralph/tasks/{{ taskId }}/state.md`
2. **Verify the current phase** — this reference is for the Implement & Review phase.
3. **Review completed phases** — confirm the Analyze phase is done and the analyst produced a plan.

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

Do not read any of the subagent outputs — the subagents read each other's feedback as appropriate.

#### Step 2: Read coder status

Read `.ralph/tasks/{{ taskId }}/artifacts/ralph-coder/status.json`.

| `result` | Action |
|---|---|
| `implemented` | Proceed to Step 3 (dispatch reviewer) |
| `partial` | **Exit loop** — skip review, proceed to Package phase with partial status |

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
| `pass` | any | **Exit loop** — proceed to Package phase |
| `fail` | < 2 | Increment iteration, go back to Step 1 |
| `fail` | = 2 | **Exit loop** — accept as-is, proceed to Package phase |

Record the reviewer's `summary` and verdict in `state.md`.

### After the loop

Note the final outcome in `state.md`:
- How many iterations ran
- Final reviewer verdict (or `partial` if coder couldn't complete)
- Whether the code is ready to commit

## Before moving to the next phase

Update `state.md`:
- Set "Current Phase" to the Package phase
- Set "Reference file for this phase" to `references/4-package.md`
- Keep the reminder line
- Add the Implement & Review phase to "Completed Phases" with iteration count and final status
