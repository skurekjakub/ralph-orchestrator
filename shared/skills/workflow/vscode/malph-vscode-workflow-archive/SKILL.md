---
name: malph-vscode-workflow-archive
description: "VS Code extension review orchestrator Phase 6 — the final phase. Dispatch the scribe subagent to archive review knowledge to Ralphchives, then return the result."
---

# Phase 6: Archive & Exit

## Before you begin

1. **Read `state.md`** at `.ralph/tasks/{{ taskId }}/state.md`
2. **Verify the current phase** — this skill is for Phase 6.
3. **Review completed phases** — confirm Phase 5 (Handoff) is done.

## Instructions

### 1. Dispatch the scribe

Delegate to the `ralph-scribe` sub-agent. It will:
- Read all subagent artifacts from `.ralph/tasks/{{ taskId }}/artifacts/`
- Post general observations and a task report to Ralphchives
- Write its status to `.ralph/tasks/{{ taskId }}/artifacts/ralph-scribe/status.json`

### 2. Read scribe status

Read `.ralph/tasks/{{ taskId }}/artifacts/ralph-scribe/status.json`.

| `result` | Action |
|---|---|
| `archived` | Proceed to exit |
| `skipped` | Proceed to exit (nothing worth archiving) |
| Any failure | Log it, proceed to exit anyway — archival is non-blocking |

### 3. Return your result

**This is mandatory.** End the run with your result, as `<result-contract>` describes:

- `STATUS`: `completed`
- `SUMMARY`: `Review panel for {{ taskId }}. Verdict: APPROVED | NEEDS REVISION (N total findings across 3 reviewers).`

Use `completed` for both approvals and revision requests — Malph always completes successfully.
