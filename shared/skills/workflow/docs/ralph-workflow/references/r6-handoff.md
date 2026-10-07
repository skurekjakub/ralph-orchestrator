{%- if isRevision %}
# Revision Phase 6: Handoff & Exit

## Before you begin

1. **Read `state.md`** at `.ralph/tasks/{{ taskId }}/state.md`
2. **Verify the current phase** — this skill is for Revision Phase 6. If `state.md` shows a different current phase, update it now.
3. **Review "Completed Phases"** — you need a summary of everything done.

## Phase 6: Dispatch ralph-scribe

Dispatch the `ralph-scribe` sub-agent with a one-line directive (e.g. "Compose and deliver revision handoff artifacts for {{ taskId }}"). Keep the dispatch prompt lean. The scribe reads `state.md`, upstream artifacts, and the current repo state directly from the filesystem.

After the scribe completes, read only its `status.json`.

- `result: delivered` — proceed to your result.
- `result: partial` — proceed to your result, but treat the task as partial and preserve the scribe `summary` in `state.md`.

### Result

**This is mandatory.** End the run with your result, as `<result-contract>` describes:

- `STATUS`: `completed`, `partial` or `blocked`
- `JIRA_KEY`: `{{ taskId }}`
- `BRANCH`: `ralph/{{ taskId }}-<short-slug>`
- `PR_URL`: the full ADO PR URL; leave it out if it is unavailable
- `HANDOFF`: `/tmp/mcp-attachments/handoff-{{ taskId }}.md`
- `SUMMARY`: one line on the revision changes

⚠️ **Do NOT continue working after returning your result.**
{%- else %}
<!-- This file is for the revision workflow. You are running a standard workflow — this file is intentionally empty. -->
{%- endif %}
