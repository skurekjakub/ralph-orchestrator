---
name: vscode-workflow-revision-setup
description: "VS Code extension revision workflow Phase 1. Read this skill when a task comes back for revision. Covers reading reviewer feedback, finding the existing PR and branch, and planning the fix."
---

# Revision Phase 1: Understand Feedback & Find PR

## Before you begin

1. **Read `state.md`** at `.ralph/tasks/{{ taskId }}/state.md` — if it doesn't exist, create it (see below).
2. This skill is for **Revision Phase 1**.

## Context

This is a **revision** — a human reviewer has looked at your previous work, found issues, and transitioned the JIRA issue back for fixes. Your prompt contains:
- The **previous handoff file** (your earlier decisions and what was accomplished)
- All **JIRA comments** (including reviewer feedback)
- The original JIRA issue details

## Instructions

### Understand the feedback

1. **Read the previous handoff file** embedded in your prompt — understand what was done and the PR details
2. **Read ALL JIRA comments** embedded in your prompt — identify what the reviewer wants changed
3. **Build a clear list of required fixes** from the feedback

### Find existing PR & branch

1. **Find and switch to the existing branch** matching `ralph/{{ taskId }}-*`:
   ```bash
   git fetch origin
   git branch -r | grep -i "ralph/{{ taskId }}"
   git checkout <branch-name>
   git pull origin <branch-name>
   ```
   Do NOT create a new branch.

2. **Find the existing PR** using `ado_list_pull_requests`, filtering by the source branch

3. **Read ALL PR review threads** using `ado_list_pull_request_threads` with the PR ID

### Create or update state.md

Create or update `.ralph/tasks/{{ taskId }}/state.md`:

```markdown
# Task State: {{ taskId }} — {{ taskTitle }} (REVISION)

## Current Phase
Revision Phase 1: Understand Feedback

### Skills for this phase
- vscode-workflow-revision-setup

> ⚠️ STOP — Read every skill listed above BEFORE doing any work in this phase.

## Feedback Summary
<!-- List each item the reviewer wants fixed -->

## Tracked Identifiers
- Branch: <branch name>
- PR ID: <PR ID>
- PR URL: <PR URL>

## Completed Phases
(none yet)
```

## Before moving to Revision Phase 2

Update `state.md`:
- Set "Current Phase" to `Revision Phase 2: Fix`
- Set "Skills for this phase" to:
  - vscode-workflow-revision-fix
- Add Revision Phase 1 to "Completed Phases" with feedback summary
