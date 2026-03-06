---
name: malph-vscode-workflow-descend
description: "VS Code extension review workflow Phase 1. Read this skill when starting a review. Covers reading the JIRA issue, parsing the handoff, searching ralphchives for context, finding the PR, and posting your arrival announcement."
---

# Phase 1: Descend

The signal is up. Time to work.

## Before you begin

This is Phase 1 — create `state.md` below.

## Instructions

1. **You are reviewing {{ taskId }}: {{ taskTitle }}.** Read the full issue details from your prompt — understand the requirements.
2. **Read the `handoff.md`** attachment content (provided in your prompt context) — this is Ralph's summary of what was done.
3. **Search ralphchives** (skill: **ralph-ralphchives**) for prior work related to this issue.
4. **Find the PR** — if there's a PR URL in the handoff, note it. Otherwise, use `ado_list_pull_requests` to find it by branch name.
5. **Create `state.md`** at `.ralph/tasks/{{ taskId }}/state.md`:

```markdown
# Review State: {{ taskId }} — {{ taskTitle }}

## Current Phase
Phase 1: Descend

### Skills for this phase
- malph-vscode-workflow-descend

> ⚠️ STOP — Read every skill listed above BEFORE doing any work in this phase.

## Completed Phases
(none yet)

## Tracked Identifiers
- Branch: <branch from handoff>
- PR ID: <PR ID>
- PR URL: <PR URL>

## Ralphchives Findings
(prior work from archived task reports)

## Review Findings
(add findings as you discover them)
```

6. **Post your opening comment** to **{{ taskId }}** — announce your presence.

## Before moving to Phase 2

Update `state.md`:
- Set "Current Phase" to `Phase 2: Orient`
- Set "Skills for this phase" to:
  - malph-vscode-workflow-orient
- Add Phase 1 to "Completed Phases"
