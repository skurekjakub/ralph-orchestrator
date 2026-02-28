---
name: ralph-workflow-handoff
description: "Standard workflow Phase 8 — the final phase. Read this skill when the PR is created (or attempted) and you're ready to wrap up. Covers writing the handoff document with source references, attaching it to JIRA, posting a completion comment, reporting to ralphchives, and printing the ===RALPH_RESULT_START=== exit block. The exit block is mandatory — the orchestrator cannot detect completion without it."
---

# Phase 8: Handoff, Report & Exit

## Before you begin

1. **Read `state.md`** at `.ralph/tasks/{{ taskId }}/state.md`
2. **Verify the current phase** — this skill is for Phase 8. If `state.md` shows a different current phase, update it now.
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

## Source Code References
<!-- For any claim derived from exploring the Xperience source code, list the exact location that backs it:
- Claim: "RFS cannot be nested" → `CMSSolution/ContentTypes/ReusableFieldSchemaValidator.cs:L45` — `ValidateNesting()` throws if parent is already an RFS
- Claim: "Changes propagate to all content types" → `CMSSolution/ContentTypes/FieldSchemaManager.cs:L120-135` — `PropagateChanges()` iterates all referencing types
If no source exploration was needed, write "N/A — changes based on JIRA description only" -->

## Review Status
<!-- Approved | Approved after N cycles | Not converged after 2 cycles (with details) -->

## Open Questions Requiring Human Judgment
<!-- Anything the human should verify -->

## Pull Request
<!-- Link to the ADO PR -->

## Suggested Next Steps
<!-- What the human should do after reviewing -->
```

### 2. Attach the handoff file

Attach to the JIRA issue using the `jira_add_attachment` MCP tool with issue key `{{ taskId }}` and file name `handoff.md`.

### 3. Post a completion comment

Post on **{{ taskId }}** using `jira_add_comment`. Include whatever you think is useful — changes summary, PR link, files touched, test results, caveats, follow-ups. Use rich wiki markup formatting (headings, bullet lists, bold, links, code blocks, emoji) so a reviewer can scan it quickly.

**Source code evidence:** If any documentation claims are based on exploring the Xperience source code, include a "Source References" section in the comment. Consult the **ralph-source-references** skill for the source browser URL format.

### 4. Post to ralphchives

Post a task report (skill: **ralph-ralphchives**) summarizing what was accomplished, key decisions, and any remaining gaps.

### 5. Exit

Print a final summary to stdout in this **exact format** — the orchestrator parses it:

```
===RALPH_RESULT_START===
JIRA_KEY: {{ taskId }}
STATUS: <completed|partial|blocked>
BRANCH: ralph/{{ taskId }}-<short-slug>
PR_URL: <full ADO PR URL, or "none" if PR creation failed>
HANDOFF: /tmp/mcp-attachments/handoff-{{ taskId }}.md
SUMMARY: <one-line description of what was done>
===RALPH_RESULT_END===
```

Always include this block as the very last thing you print, even on failure.

**CRITICAL:** The orchestrator uses this block to detect task completion.
