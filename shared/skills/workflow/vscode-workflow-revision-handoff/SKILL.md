---
name: vscode-workflow-revision-handoff
description: "VS Code extension revision workflow Phase 4 — the final revision phase. Covers updating the handoff document with a revision section, attaching to JIRA, posting a completion comment, and printing the exit block."
---

# Revision Phase 4: Update Handoff & Exit

## Before you begin

1. **Read `state.md`** at `.ralph/tasks/{{ taskId }}/state.md`
2. **Verify the current phase** — this skill is for Revision Phase 4.
3. **Review "Tracked Identifiers"** — you need the PR URL.

## Instructions

### 1. Create updated handoff

Create at `/tmp/mcp-attachments/handoff-{{ taskId }}.md` — add a "Revision" section at the top documenting what feedback was addressed and what changed:

```markdown
# Handoff: {{ taskId }} — {{ taskTitle }} (Revision)

## Revision Changes
<!-- What feedback was addressed, what changed -->

## Task Status
<!-- completed | partial | blocked -->

## What Was Accomplished
<!-- Full list including original + revision changes -->

## Build & Test Status
- Build: PASS | FAIL
- Lint: PASS | FAIL
- Tests: PASS | FAIL | SKIPPED (reason)

## Pull Request
<!-- Link to the ADO PR -->
```

### 2. Upload handoff to JIRA

Use the `jira_add_attachment` tool to upload the handoff file to **{{ taskId }}** with file name `handoff-{{ taskId }}.md`.

### 3. Post completion comment

Post a completion comment on **{{ taskId }}** summarizing:
- What revision feedback was addressed
- Link to the PR
- Build/lint/test results

### 4. Print exit block

```
===RALPH_RESULT_START===
STATUS: completed | partial | blocked
PR_URL: <full ADO PR URL>
SUMMARY: <one-line description of revision changes>
===RALPH_RESULT_END===
```
