{%- if isRevision %}
# Revision Phase 6: Handoff & Exit

## Before you begin

1. **Read `state.md`** at `.ralph/tasks/{{ taskId }}/state.md`
2. **Verify the current phase** — this skill is for Revision Phase 6. If `state.md` shows a different current phase, update it now.
3. **Review "Completed Phases"** — you need a summary of everything done.

## Phase 6: Dispatch ralph-scribe

Dispatch the `ralph-scribe` sub-agent with a one-line directive (e.g. "Compose and deliver revision handoff artifacts for {{ taskId }}"). Keep the dispatch prompt lean. The scribe reads `state.md`, upstream artifacts, and the current repo state directly from the filesystem.

After the scribe completes, read only its `status.json`.

- `result: delivered` — proceed to the exit block.
- `result: partial` — proceed to the exit block, but treat the task as partial and preserve the scribe `summary` in `state.md`.

### Exit block

**This is mandatory.** Write the result block so the orchestrator can collect it:

```
===RALPH_RESULT_START===
JIRA_KEY: {{ taskId }}
STATUS: <completed|partial|blocked>
BRANCH: ralph/{{ taskId }}-<short-slug>
PR_URL: <full ADO PR URL, or "none" if unavailable>
HANDOFF: /tmp/mcp-attachments/handoff-{{ taskId }}.md
SUMMARY: <one-line summary of revision changes>
===RALPH_RESULT_END===
```

⚠️ **Do NOT continue working after writing the exit block.**
{%- else %}
<!-- This file is for the revision workflow. You are running a standard workflow — this file is intentionally empty. -->
{%- endif %}
