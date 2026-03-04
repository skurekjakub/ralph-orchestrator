---
name: malph-vscode-workflow-handoff
description: "VS Code extension review workflow Phase 7 — the final phase. Covers writing the review handoff document, attaching it to JIRA, reporting to ralphchives, and printing the exit block."
---

# Phase 7: Handoff & Exit

## Before you begin

1. **Read `state.md`** at `.ralph/tasks/{{ taskId }}/state.md`
2. **Verify the current phase** — this skill is for Phase 7.
3. **Confirm Phase 6** (Deliver) is done — verdict posted to JIRA and ADO.

## Instructions

### 1. Write review handoff

Create at `/tmp/mcp-attachments/review-handoff-{{ taskId }}.md`:

```markdown
# Review Handoff — {{ taskId }}

## Verdict: APPROVED | NEEDS REVISION

## Build Status
- Compile: PASS | FAIL
- Lint: PASS | FAIL (N warnings)
- Tests: PASS | FAIL (N passed, N failed)

## Files Reviewed
- <list of files reviewed with paths>

## PR
- Branch: <branch name>
- PR URL: <PR URL>

## Findings
<Full structured findings — issue codes, file paths, line numbers,
problematic code, corrections. For APPROVED verdicts, "No issues found."
and any minor suggestions.>
```

### 2. Attach to JIRA

Use the `jira_add_attachment` tool to upload `review-handoff-{{ taskId }}.md` to **{{ taskId }}**.

### 3. Report to ralphchives

Post a task report to ralphchives (skill: **ralph-ralphchives**) summarizing the review — verdict, finding counts, notable patterns.

### 4. Print exit block

```
===RALPH_RESULT_START===
STATUS: completed
SUMMARY: Reviewed PR for {{ taskId }}. Verdict: APPROVED | NEEDS REVISION (N issues found).
===RALPH_RESULT_END===
```

Use `completed` for both approvals and revision requests — Malph always completes successfully.
