{%- unless isRevision %}
# Phase 7: Handoff, Report & Exit

## Before you begin

1. **Read `state.md`** at `.ralph/tasks/{{ taskId }}/state.md`
2. **Verify the current phase** — this reference is for Phase 7.
3. **Review completed phases** — confirm all prior phases are done. Check "Tracked Identifiers" for PR URL.

## Instructions

### 1. Create the handoff file

Create at `/tmp/mcp-attachments/handoff-{{ taskId }}.md`:

```markdown
# Handoff: {{ taskId }} — {{ taskTitle }}

## Task Status
<!-- completed | partial | blocked -->

## What Was Accomplished
<!-- List all changes with file paths -->

## What Remains and Why
<!-- If partial/blocked, explain what couldn't be done -->

## Key Decisions Made
<!-- Every autonomous decision with rationale -->

## Build & Test Status
- Build: PASS | FAIL
- Lint: PASS | FAIL
- Tests: PASS | FAIL | SKIPPED (reason)

## Open Questions Requiring Human Judgment
<!-- Anything the human should verify -->

## Pull Request
<!-- Link to the ADO PR -->
```

### 2. Upload handoff + the .vsix binary to JIRA

Use the `jira_add_attachment` tool to upload the handoff file to **{{ taskId }}** with file name `handoff-{{ taskId }}.md`.

Also upload the latest compiled .vsix binary for the patch version you incremented to.

### 3. Post completion comment

Post a rich comment on **{{ taskId }}**. Include:
- Changes summary
- PR link
- Build/lint/test results
- Caveats, follow-ups
- Use headings, bullet lists, bold, links, code blocks, emoji — format it so a reviewer can scan it quickly

## Before moving to Phase 8

Update `state.md`:
- Set "Current Phase" to `Phase 8: Archive & Exit`
- Set "Reference file for this phase" to `references/8-archive.md`
- Keep the reminder line
- Add Phase 7 to "Completed Phases"
{%- else %}
<!-- This file is for the standard workflow. You are running a revision workflow — see references/r6-handoff.md instead. -->
{%- endunless %}
