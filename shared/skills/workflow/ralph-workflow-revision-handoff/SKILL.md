---
name: ralph-workflow-revision-handoff
description: "Revision workflow Phases 6-7 — the final revision phase. Read this skill after pushing fixes and responding to PR threads. Covers updating the existing handoff document (append, don't replace), attaching to JIRA, posting a completion comment, reporting revision learnings to ralphchives, and printing the ===RALPH_RESULT_START=== exit block. The exit block is mandatory."
---

# Revision Phase 6-7: Update Handoff & Exit

## Before you begin

1. **Read `state.md`** at `resources/chats/{{ taskId }}/state.md`
2. **Verify the current phase** — this skill is for Revision Phase 6. If `state.md` shows a different current phase, update it now.
3. **Review "Completed Phases"** — you need a summary of everything done.

## Phase 6: Update Handoff

Update the existing handoff file at `resources/chats/{{ taskId }}/handoff.md`:

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

Report to ralphchives what you learned during this revision cycle — especially corrections, patterns, or things the original pass got wrong.

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
