---
name: vscode-workflow-analyze
description: "VS Code extension workflow Phase 2. Dispatch the ralph-analyst subagent, read its status.json, and record the analysis outcome in state.md."
---

# Phase 2: Analyze

## Before you begin

1. **Read `state.md`** at `.ralph/tasks/{{ taskId }}/state.md`
2. **Verify the current phase** — this skill is for Phase 2. If `state.md` shows a different current phase, update it now.
3. **Review completed phases** — confirm Phase 1 (Setup) is done.

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
| `analyzed` | Proceed to Phase 3 (Implement & Review) |
| Any `status: failed` or `blocked` | Stop, set overall status to `blocked`, proceed to handoff |

**Do NOT read `output.md`** — you are a router. The coder will read the analyst's output directly.

Record the analyst's `summary` field from `status.json` in `state.md` under "Key Decisions".

## Before moving to the next phase

Update `state.md`:
- Set "Current Phase" to the next phase listed in the workflow table (standard: `Phase 3: Implement & Review`, revision: `Revision Phase 3: Fix & Review`)
- Set "Skills for this phase" to the skill listed in the workflow table for that phase
- Keep the reminder line: `> ⚠️ STOP — Read every skill listed above BEFORE doing any work in this phase.`
- Add the analyze phase to "Completed Phases" with analyst status summary
