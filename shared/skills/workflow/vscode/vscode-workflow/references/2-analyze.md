# Phase 2: Analyze

## Before you begin

1. **Read `state.md`** at `.ralph/tasks/{{ taskId }}/state.md`
2. **Verify the current phase** — this reference is for the Analyze phase.
3. **Review completed phases** — confirm Setup is done.

## Instructions

### Dispatch the analyst

Delegate to the `ralph-analyst` sub-agent. Pass the full JIRA issue details (key, summary, description) so it can research the codebase and produce an implementation plan.

The analyst will:
- Search ralphchives for prior work
- Analyze the codebase
- Write its implementation plan to `.ralph/tasks/{{ taskId }}/artifacts/ralph-analyst/output.md`
- Write its status to `.ralph/tasks/{{ taskId }}/artifacts/ralph-analyst/status.json`

### Read the result

After the analyst returns, read `.ralph/tasks/{{ taskId }}/artifacts/ralph-analyst/status.json`.

| `result` | Action |
|---|---|
{%- if triggerParams.skip_planner %}
| `analyzed` | Proceed to the next phase (Implement & Review) |
{%- else %}
| `analyzed` | Dispatch `ralph-planner` (see below) |
{%- endif %}
| Any `status: failed` or `blocked` | Stop, set overall status to `blocked`, proceed to handoff |

**Do NOT read `output.md`** — you are a router. The coder will read the analyst's output directly.

Record the analyst's `summary` field from `status.json` in `state.md` under "Key Decisions".
{%- unless triggerParams.skip_planner %}

### Dispatch the planner

Delegate to the `ralph-planner` sub-agent. It will:
- Read the analyst's implementation plan from `.ralph/tasks/{{ taskId }}/artifacts/ralph-analyst/output.md`
- Break it into ordered task files
- Write task files to `.ralph/tasks/{{ taskId }}/artifacts/ralph-planner/`
- Write its status to `.ralph/tasks/{{ taskId }}/artifacts/ralph-planner/status.json`

After the planner returns, read `.ralph/tasks/{{ taskId }}/artifacts/ralph-planner/status.json`.

| `result` | Action |
|---|---|
| `planned` | Proceed to the next phase (Implement & Review). Record the task count from `summary` in `state.md`. |
| `blocked` | Stop, set overall status to `blocked`, proceed to handoff |

**Do NOT read `output.md` or task files** — the coder reads the planner's artifacts directly.
{%- endunless %}

## Before moving to the next phase

Update `state.md`:
{%- if isRevision %}
- Set "Current Phase" to `Revision Phase 3: Fix & Review`
- Set "Reference file for this phase" to `references/3-implement-loop.md`
{%- else %}
- Set "Current Phase" to `Phase 3: Implement & Review`
- Set "Reference file for this phase" to `references/3-implement-loop.md`
{%- endif %}
- Keep the reminder line
- Add the Analyze phase to "Completed Phases" with analyst status summary
