# Archive & Exit

## Before you begin

1. **Read `state.md`** at `.ralph/tasks/{{ taskId }}/state.md`
2. **Verify the current phase** — this reference is for the Archive & Exit phase.
3. **Review completed phases** — confirm Handoff is done.

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

### 3. Print exit block

Output the result block — this is **mandatory** for orchestrator detection:

```
===RALPH_RESULT_START===
STATUS: completed | partial | blocked
PR_URL: <url or none>
SUMMARY: <one-line summary>
===RALPH_RESULT_END===
```
