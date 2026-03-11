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
| `analyzed` | Proceed to the next phase (Implement & Review) |
| Any `status: failed` or `blocked` | Stop, set overall status to `blocked`, proceed to handoff |

**Do NOT read `output.md`** — you are a router. The coder will read the analyst's output directly.

Record the analyst's `summary` field from `status.json` in `state.md` under "Key Decisions".

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
