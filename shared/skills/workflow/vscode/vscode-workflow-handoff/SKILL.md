---
name: vscode-workflow-handoff
description: "VS Code extension workflow Phase 6. Read this skill when the PR is created (or attempted). Covers writing the handoff document, attaching it to JIRA, and posting a completion comment."
---

# Phase 6: Handoff, Report & Exit

## Before you begin

1. **Read `state.md`** at `.ralph/tasks/{{ taskId }}/state.md`
2. **Verify the current phase** — this skill is for Phase 6. If `state.md` shows a different current phase, update it now.
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

### 2. Upload handoff to JIRA

Use the `jira_add_attachment` tool to upload the handoff file to **{{ taskId }}** with file name `handoff-{{ taskId }}.md`.

### 3. Post completion comment

Post a rich comment on **{{ taskId }}**. Include:
- Changes summary
- PR link
- Build/lint/test results
- Caveats, follow-ups
- Use headings, bullet lists, bold, links, code blocks, emoji — format it so a reviewer can scan it quickly

## Before moving to Phase 7

Update `state.md`:
- Set "Current Phase" to `Phase 7: Archive & Exit`
- Set "Skills for this phase" to:
  - vscode-workflow-archive
- Keep the reminder line: `> ⚠️ STOP — Read every skill listed above BEFORE doing any work in this phase.`
- Add Phase 6 to "Completed Phases"
