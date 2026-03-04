---
name: ralph-workflow-revision-setup
description: "Revision workflow Phases 1-2. Read this skill at the start of every revision task (isRevision=true). Covers reading the previous handoff and JIRA reviewer comments, searching ralphchives for prior gotchas, finding the existing branch and PR via ADO, reading all PR review threads, and creating state.md with the revision template and feedback checklist. Always the first phase in a revision run."
---

# Revision Phase 1-2: Understand Feedback & Find Existing PR

## Before you begin

1. **Read `state.md`** at `.ralph/tasks/{{ taskId }}/state.md` — if this is the start of a revision, the file may not exist. Create it below.
2. This skill covers Revision Phases 1 and 2. If you've already completed these, skip to the next phase.

## Phase 1: Understand Feedback

1. **Read the previous handoff file** embedded in your prompt — understand what was done, what decisions were made, and the PR details
2. **Read ALL JIRA comments** embedded in your prompt — identify what the reviewer wants changed
3. **Search ralphchives** (skill: **ralph-ralphchives**) for any observations or gotchas related to this issue from previous runs
4. You are revising **{{ taskId }}: {{ taskTitle }}** — use this key for branch/commit naming

## Phase 2: Find Existing PR & Branch

{% if prUrl != "" %}
The PR URL from the previous run is: **{{ prUrl }}**

1. You start on the correct branch already.
2. **Read ALL PR review threads** to understand inline feedback:
   - Use `ado_list_pull_request_threads` with the PR ID
{% else %}
3. **Find the existing branch** matching the pattern `ralph/{{ taskId }}-*`:
   ```bash
   git fetch origin
   git branch -r | grep "ralph/{{ taskId }}"
   ```
4. **Switch to the existing branch** (do NOT create a new one):
   ```bash
   git checkout ralph/{{ taskId }}-<slug>
   git pull origin ralph/{{ taskId }}-<slug>
   ```
5. **Find the existing PR** using the ADO MCP server:
   - Use `list-pull-requests` targetting {{ triggerParams.source_branch }}
   - Note the PR ID from the result
6. **Read ALL PR review threads** to understand inline feedback:
   - Use `list-pull-request-threads` with the PR ID from above
{% endif %}

## Create or update state.md

If `state.md` doesn't exist, create it at `.ralph/tasks/{{ taskId }}/state.md`:

```markdown
# Task State: {{ taskId }} — {{ taskTitle }} (REVISION)

## Current Phase
Revision Phase 1-2: Understand Feedback & Find PR

### Skills for this phase
- ralph-workflow-revision-setup

## Completed Phases
(none yet — this is a revision run)

## Feedback Items
(list each feedback item from JIRA comments and PR threads)

## Key Decisions
(from previous handoff — copy relevant decisions here)

## Tracked Identifiers
- Branch: ralph/{{ taskId }}-<slug>
- PR URL: {{ prUrl }}
(page identifiers from previous run)

## Source References
(from previous handoff — copy relevant references)

## Notes
(anything else)
```

## Before moving to Revision Phase 3

Update `state.md`:
- Set "Current Phase" to `Revision Phase 3: Implement Fixes`
- Set "Skills for this phase" to:
  - ralph-workflow-revision-fix
  - ralph-documentation-syntax (if fixing tag syntax issues)
  - ralph-build-errors (if build is broken)
  - ralph-callout-selection (if feedback mentions callout severity)
- Add Revision Phases 1-2 to "Completed Phases" with feedback summary
- List all feedback items under "Feedback Items"
