---
name: malph-workflow-handoff
description: "Malph review workflow Phase 6 — the final phase. Read this skill after dispatching the verdict agent. Covers attaching the review handoff to JIRA, posting to ralphchives, and printing the ralph-result exit block."
---

# Phase 6: Handoff & Exit

## Before you begin

1. **Read `state.md`** at `.ralph/tasks/{{ taskId }}/state.md`
2. This skill is for **Phase 6: Handoff & Exit**. If you've already completed this phase, you should have already printed the exit block.
3. **Check the verdict** in `state.md` — confirm Phase 5 is complete and `malph-verdict` has returned.

## Instructions

### 1. Attach the review handoff to JIRA

The `malph-verdict` agent has already written the review handoff to `/tmp/mcp-attachments/review-handoff.md`.

Attach the file to **{{ taskId }}** using the `jira_add_attachment` tool with file name `review-handoff.md`.

### 2. Report to ralphchives

Use the verdict summary from `malph-verdict`'s `status.json` to report:

1. Search for an existing thread: `search_ralphchives` with query `{{ taskId }}`
2. If a thread exists (Ralph's task report) → use `reply_to_thread` to add the review verdict as a reply
3. Only if no thread exists → use `post_task_report` to create one

Keep the ralphchives report brief — the verdict and issue count from `status.json` is sufficient.

### 3. Return result

Output your result in this exact format:

```
<ralph-result>
status: completed
summary: Reviewed PR for {{ taskId }}. Verdict: APPROVED | NEEDS REVISION (N issues found).
</ralph-result>
```

Use `completed` for both approvals and revision requests — Malph always completes successfully. Derive the verdict and issue count from the `malph-verdict` status.json `result` and `summary` fields.
