---
name: ralph-workflow-revision-handoff
description: "Revision workflow Phases 6-7 — the final revision phase. Read this skill after pushing fixes and responding to PR threads. Covers updating the existing handoff document (append, don't replace), attaching to JIRA, posting a completion comment, reporting revision learnings to ralphchives, and printing the ===RALPH_RESULT_START=== exit block. The exit block is mandatory."
---

# Revision Phase 6-7: Update Handoff & Exit

## Before you begin

1. **Read `state.md`** at `.ralph/tasks/{{ taskId }}/state.md`
2. **Verify the current phase** — this skill is for Revision Phase 6. If `state.md` shows a different current phase, update it now.
3. **Review "Completed Phases"** — you need a summary of everything done.

## Phase 6: Update Handoff

Update the existing handoff file at `.ralph/tasks/{{ taskId }}/handoff.md`:

1. **Add a "Revision" section** summarizing what was changed and why
2. **Preserve the original handoff content** — append, don't replace
3. **List feedback items** and how each was addressed (or why it wasn't)

Attach the updated handoff to the JIRA issue using the JIRA MCP tools.

Post a **completion comment** on the JIRA issue:
> Review feedback addressed. Updated [list of files]. See handoff for details.

## Phase 7: Ralphchives & Exit

{%- if triggerParams.skip_ralphchives %}

Ralphchives reporting was skipped for this task.

{%- else %}

**This is a revision — an existing ralphchives thread almost certainly exists from the first pass.**

1. Search ralphchives for the issue key `{{ taskId }}` using `search_ralphchives`
2. **If a thread exists** (it should): use `reply_to_thread` to add your revision summary as a reply. Do NOT create a new topic.
3. **Only if no thread exists** (unlikely): use `post_task_report` to create one.

Include in your reply: what feedback was addressed, corrections made, and any patterns or gotchas discovered during the revision.

{%- endif %}

### Exit block

**This is mandatory.** Write the result block so the orchestrator can collect it:

```
===RALPH_RESULT_START===
status: completed
summary: <one-line summary of revision changes>
===RALPH_RESULT_END===
```

⚠️ **Do NOT continue working after writing the exit block.**
