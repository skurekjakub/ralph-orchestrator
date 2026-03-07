---
name: malph-vscode-workflow-setup
description: "VS Code extension review orchestrator Phase 1. Read this skill when starting a review. Covers reading the JIRA issue, finding the PR, creating the artifacts directory, and posting the arrival announcement."
---

# Phase 1: Setup

The signal is up. Time to assemble the panel.

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
Phase 1: Setup

### Skills for this phase
- malph-vscode-workflow-setup

> ⚠️ STOP — Read every skill listed above BEFORE doing any work in this phase.

## Completed Phases
(none yet)

## Tracked Identifiers
- Branch: <branch from handoff>
- PR ID: <PR ID>
- PR URL: <PR URL>

## Ralphchives Findings
(prior work from archived task reports)

## Reviewer Verdicts
| Reviewer | Verdict | Findings |
|---|---|---|
| malph-reviewer-opus | pending | — |
| malph-reviewer-gpt | pending | — |
| malph-reviewer-gemini | pending | — |

## Panel Verdict
(will be aggregated after all reviewers complete)
```

6. **Create the artifacts directory** at `.ralph/tasks/{{ taskId }}/artifacts/` — subagents will write their outputs here.

7. **Post your opening comment** to **{{ taskId }}** — announce your presence and the review panel.

## Before moving to the next phase

Update `state.md`:
- Set "Current Phase" to `Phase 2: Scout`
- Set "Skills for this phase" to:
  - malph-vscode-workflow-scout
- Keep the reminder line: `> ⚠️ STOP — Read every skill listed above BEFORE doing any work in this phase.`
- Add Phase 1 to "Completed Phases"
