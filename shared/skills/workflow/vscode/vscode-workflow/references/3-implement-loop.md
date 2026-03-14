# Phase 3: Implement & Review Loop

## Before you begin

1. **Read `state.md`** at `.ralph/tasks/{{ taskId }}/state.md`
2. **Verify the current phase** — this reference is for the Implement & Review phase.
3. **Review completed phases** — confirm the Analyze phase is done and the analyst produced a plan.{%- unless triggerParams.skip_planner %} Also confirm the planner produced task files.{%- endunless %}

## Instructions

{%- if triggerParams.skip_planner %}

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

{%- else %}

### Per-task loop: iterate planned tasks with coder → reviewer

The planner produced a `tasks.json` with ordered task files. Process each task sequentially. For each task, run a coder→reviewer loop (max 3 revision rounds per task).

#### Resuming from a partial state

If a previous session was interrupted (e.g., SIGINT at timeout), the `tasks.json` may show a task as `in_progress` even though the coder completed. Before starting the loop, **read `tasks.json` and check for stale `in_progress` tasks**:

1. If a task is `in_progress`, check whether `ralph-coder/status.json` has `result: "implemented"` for that task
2. If the coder completed but no reviewer ran, **dispatch the reviewer** for that task instead of re-dispatching the coder
3. If the coder's `status.json` is missing or has a different task context, re-dispatch the coder from scratch

This prevents re-implementing work that was already done in a prior session.

Track two counters:
- **Current task lifecycle** — exactly one task should be `in_progress` at a time in `tasks.json`
- **Current task attempt** — the active task's `attempt` field tracks same-task retries; `1` is the first implementation round
- **Per-task iteration** — which coder→reviewer round within the current task (starts at 1)

The orchestrator owns task lifecycle transitions in `tasks.json`:
- Planner initializes all tasks as `not_processed`
- Planner initializes all task attempts as `0`
- Before dispatching coder for a task, mark that task `in_progress` and set `attempt` to `1`
- If the same task needs another coder pass, increment its `attempt` and keep it `in_progress`
- When the task is accepted, mark it `done`
- Then mark the next `not_processed` task `in_progress` with `attempt: 1`, or dispatch planner verification if none remain

#### For each planned task:

##### Step 1: Dispatch the coder

Delegate to the `ralph-coder` sub-agent. It will:
- Read the planner's task file for the current task from `.ralph/tasks/{{ taskId }}/artifacts/ralph-planner/`
- Read the analyst's plan from `.ralph/tasks/{{ taskId }}/artifacts/ralph-analyst/output.md` for broader context
- On iteration 2+, also read the reviewer's feedback from `.ralph/tasks/{{ taskId }}/artifacts/ralph-reviewer/output-v{N-1}.md`
- Implement the changes for this task, run build/lint/test
- Write its change summary to `.ralph/tasks/{{ taskId }}/artifacts/ralph-coder/output-v{N}.md`
- Write status to `.ralph/tasks/{{ taskId }}/artifacts/ralph-coder/status.json`

Do not read any of the subagent outputs — the subagents read each other's feedback as appropriate.

##### Step 2: Read coder status

Read `.ralph/tasks/{{ taskId }}/artifacts/ralph-coder/status.json`.

| `result` | Action |
|---|---|
| `implemented` | Proceed to Step 3 (dispatch reviewer) |
| `partial` | Mark the current `in_progress` task as `done`, then mark the next `not_processed` task `in_progress` or dispatch planner verification if none remain |

Record the coder's `summary` in `state.md`.

##### Step 3: Dispatch the reviewer

Delegate to the `ralph-reviewer` sub-agent. It will:
- Read the coder's change summary from `.ralph/tasks/{{ taskId }}/artifacts/ralph-coder/output-v{N}.md`
- Read the analyst's plan and the planner's task file for reference
- Read the actual changed files in the repo
- Run build/lint/test independently
- Write its review to `.ralph/tasks/{{ taskId }}/artifacts/ralph-reviewer/output-v{N}.md`
- Write status to `.ralph/tasks/{{ taskId }}/artifacts/ralph-reviewer/status.json`

##### Step 4: Read reviewer status

Read `.ralph/tasks/{{ taskId }}/artifacts/ralph-reviewer/status.json`.

| `result` | Per-task iteration | Action |
|---|---|---|
| `pass` | any | Mark the current `in_progress` task as `done`, then mark the next `not_processed` task `in_progress` or dispatch planner verification if none remain |
| `fail` | < 3 | Increment per-task iteration, go back to Step 1 for the same task |
| `fail` | = 3 | Mark the current `in_progress` task as `done`, then mark the next `not_processed` task `in_progress` or dispatch planner verification if none remain |

Record the reviewer's `summary` and verdict in `state.md`.

#### After each task completes

Update `state.md` with:
- Task ID and final status (pass / accepted after N rounds / partial)
- Iteration count for that task

#### After all tasks complete

Note the per-pass outcome in `state.md`:
- Total tasks processed and per-task outcomes
- Whether all code is ready to commit

### Planner verification pass (max 2 passes total)

After all planned tasks from the current pass are `done`, dispatch `ralph-planner` again for a **verification pass**. Tell it this is a verification dispatch (not the initial plan).

The planner will re-read the spec, inspect the codebase, and compare:

| `result` | Action |
|---|---|
| `verified` | All spec requirements met — proceed to Package |
| `gaps_found` | Planner produced new task files for remaining gaps — execute the per-task loop above for the new tasks |
| `blocked` | Stop, set overall status to `blocked`, proceed to handoff |

**Maximum 2 planner passes.** If the verification pass produces `gaps_found`, execute the new tasks and then proceed to Package — do NOT dispatch the planner a third time.

Record verification outcome in `state.md`.

{%- endif %}

## Before moving to the next phase

Update `state.md`:
- Set "Current Phase" to the Package phase
- Set "Reference file for this phase" to `references/4-package.md`
- Keep the reminder line
- Add the Implement & Review phase to "Completed Phases" with iteration count and final status
