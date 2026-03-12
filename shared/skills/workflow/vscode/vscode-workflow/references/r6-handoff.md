{%- if isRevision %}
# Revision Phase 6: Update Handoff

## Before you begin

1. **Read `state.md`** at `.ralph/tasks/{{ taskId }}/state.md`
2. **Verify the current phase** — this reference is for Revision Phase 6.
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

## Before moving to Revision Phase 7

Update `state.md`:
- Set "Current Phase" to `Revision Phase 7: Archive & Exit`
- Set "Reference file for this phase" to `references/8-archive.md`
- Keep the reminder line
- Add Revision Phase 6 to "Completed Phases"
{%- else %}
<!-- This file is for the revision workflow. You are running a standard workflow — see references/7-handoff.md instead. -->
{%- endif %}
