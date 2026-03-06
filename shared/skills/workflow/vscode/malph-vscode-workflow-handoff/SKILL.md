---
name: malph-vscode-workflow-handoff
description: "VS Code extension review orchestrator Phase 5. Write the review handoff document and attach it to JIRA."
---

# Phase 5: Handoff

## Before you begin

1. **Read `state.md`** at `.ralph/tasks/{{ taskId }}/state.md`
2. **Verify the current phase** — this skill is for Phase 5.
3. **Confirm Phase 4** (Aggregate & Deliver) is done — the JIRA verdict comment has been posted.

## Instructions

### 1. Write review handoff

Create at `/tmp/mcp-attachments/review-handoff-{{ taskId }}.md`:

```markdown
# Review Handoff — {{ taskId }}

## Panel Verdict: APPROVED | NEEDS REVISION

## Review Panel
| Reviewer | Model | Verdict | Findings |
|---|---|---|---|
| malph-reviewer-opus | Opus 4.6 | approved / needs-revision | N |
| malph-reviewer-gpt | GPT 5.4 | approved / needs-revision | N |
| malph-reviewer-gemini | Gemini Pro | approved / needs-revision | N |

## Build Status (from scout)
- Compile: PASS | FAIL
- Lint: PASS | FAIL (N warnings)
- Tests: PASS | FAIL (N passed, N failed)

## PR
- Branch: <branch name>
- PR URL: <PR URL>

## Aggregated Findings Summary
<Total findings by category: N critical, N style, N suggestions>

<List of unique issue codes and which reviewers flagged them>
```

### 2. Attach to JIRA

Use the `jira_add_attachment` tool to upload `review-handoff-{{ taskId }}.md` to **{{ taskId }}**.

## Before moving to the next phase

Update `state.md`:
- Set "Current Phase" to `Phase 6: Archive & Exit`
- Set "Skills for this phase" to:
  - malph-vscode-workflow-archive
- Keep the reminder line: `> ⚠️ STOP — Read every skill listed above BEFORE doing any work in this phase.`
- Add Phase 5 to "Completed Phases"
