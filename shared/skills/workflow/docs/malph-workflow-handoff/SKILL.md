---
name: malph-workflow-handoff
description: "Malph review workflow Phase 7 — the final phase. Read this skill after posting the review. Covers writing the review-handoff.md with verdict, findings, scout summary, and panel summary, attaching it to JIRA, posting to ralphchives, and printing the ralph-result exit block."
---

# Phase 7: Handoff & Exit

## Before you begin

1. **Read `state.md`** at `.ralph/tasks/{{ taskId }}/state.md`
2. This skill is for **Phase 7: Handoff & Exit**. If you've already completed this phase, you should have already printed the exit block.
3. **Check "Review Findings"**, **"Scout Findings"**, and **"Technical Findings"** in `state.md` — you need them for the handoff.

## Instructions

### 1. Create the review handoff file

Write to `/tmp/mcp-attachments/review-handoff.md`:

```markdown
# Review Handoff — {{ taskId }}

## Verdict: APPROVED | NEEDS REVISION

## Files Reviewed
- <list of files reviewed with paths>

## PR
- Branch: <branch name>
- PR URL: <PR URL if known>

## Findings

<Full structured findings from the JIRA comment — issue codes, locations,
problematic text, corrections. Copy the review content here verbatim.
For APPROVED verdicts, note "No issues found." and any minor suggestions.>

## Scout Summary
<Brief summary of the PR map, requirement coverage notes, and build status>

## Technical Review Summary
<Brief summary of the technical findings and any discrepancies found>

## Style Guides Consulted
- docs-style-guide-full.md
- guides-style-guide-full.md
- typography.md
- word-list.md
- markdown-syntax.md
```

### 2. Attach to JIRA

Attach the file to **{{ taskId }}** using the `jira_add_attachment` tool with file name `review-handoff.md`.

### 3. Report to ralphchives

1. Search for an existing thread: `search_ralphchives` with query `{{ taskId }}`
2. If a thread exists (Ralph's task report) → use `reply_to_thread` to add your review summary as a reply
3. Only if no thread exists → use `post_task_report` to create one

### 4. Return result

Output your result in this exact format:

```
<ralph-result>
status: completed
summary: Reviewed PR for {{ taskId }}. Verdict: APPROVED | NEEDS REVISION (N issues found).
</ralph-result>
```

Use `completed` for both approvals and revision requests — Malph always completes successfully. The distinction is in the JIRA comment content, not the result status.
