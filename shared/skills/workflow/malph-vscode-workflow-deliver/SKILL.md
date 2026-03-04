---
name: malph-vscode-workflow-deliver
description: "VS Code extension review workflow Phase 6. Read this skill when the review is complete. Covers posting the Review verdict as a JIRA comment (with issue codes) and posting file-level threads on the ADO PR."
---

# Phase 6: Deliver Judgment

## Before you begin

1. **Read `state.md`** at `.ralph/tasks/{{ taskId }}/state.md`
2. **Verify the current phase** — this skill is for Phase 6.
3. **Confirm all findings** are recorded from Phase 5.

## Instructions

### 6a: Post JIRA comment

Post a rich comment on **{{ taskId }}** with your review verdict. Use wiki markup formatting — headings, bold verdicts, numbered issues.

#### If NEEDS REVISION:

Post a structured comment:
1. **Build status** — compile, lint, and test results (pass/fail with errors if any)
2. **Critical issues** (must fix) — each with: issue code, exact file and line, what's wrong, exact correction
3. **Style issues** (should fix) — same structure, lower severity
4. **Suggestions** (optional) — brief enhancement ideas with rationale
5. **Verdict** — clear, decisive, with total issue counts by category

Each finding must be specific and actionable. Quote exact code. Provide exact corrections. Vague feedback is beneath you.

#### If APPROVED:

Post a concise approval. No play-by-play of things that are fine — if you're approving, it means you found nothing worth blocking on. A brief nod to what was done well is enough.

### 6b: Post review to ADO PR

1. **Extract the PR ID** from the PR URL in `state.md` (the numeric ID at the end of the URL)
2. **Read existing threads** — use `ado_list_pull_request_threads` to see prior comments. Reply to resolved threads with `ado_reply_to_comment` if appropriate.
3. **Post file-level threads** for each finding that targets a specific file and line:
   - Use `ado_create_pull_request_thread` with `threadContext` to target the exact file and line range
   - The `filePath` must be repo-relative starting with `/` (e.g., `/src/definitions/tags/block/code/code.types.ts`)
   - Use `rightFileStart`/`rightFileEnd` line numbers from the **new** (right) side of the diff
   - Include the issue code and the full finding text in the comment content
   - **Post one file at a time** — do NOT batch all threads in one call
4. **Post one general thread** as a summary comment (no `threadContext`) with your verdict and issue counts
5. **If APPROVED** — post a single general thread with the approval verdict. No file-level threads needed.

## Before moving to Phase 7

Update `state.md`:
- Set "Current Phase" to `Phase 7: Handoff & Exit`
- Set "Skills for this phase" to:
  - malph-vscode-workflow-handoff
- Add Phase 6 to "Completed Phases" with verdict
