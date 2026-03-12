{%- if isRevision %}
# Revision Phase 1-2: Capture Feedback & Rebuild State

## Before you begin

1. **Read `state.md`** at `.ralph/tasks/{{ taskId }}/state.md` — if this is the start of a revision, the file may not exist. Create it below.
2. This skill covers Revision Phases 1 and 2. If you've already completed these, skip to the next phase.

## Phase 1: Understand Feedback

1. **Read the previous handoff file** embedded in your prompt — understand what was done, what decisions were made, and the PR details
2. **Read ALL JIRA comments** embedded in your prompt — identify exactly what the reviewer wants changed
3. **Search ralphchives** (skill: **ralph-ralphchives**) for any observations or gotchas related to this issue from previous runs
4. You are revising **{{ taskId }}: {{ taskTitle }}** — use this key for branch/commit naming

## Phase 2: PR and branch strategy

{% if prUrl != "" %}
The PR URL from the previous run is: **{{ prUrl }}**

1. You start on the correct branch already.
2. **Read ALL PR review threads** to understand inline feedback:
   - Use `ado_list_pull_request_threads` with the PR ID
{% else %}
3. **You are already on the correct branch.**{% if triggerParams.branch %} The branch is `{{ triggerParams.branch }}`.{% endif %} Do NOT switch branches or create a new one.
4. **Find the existing PR** using the ADO MCP server:
   - Use `list-pull-requests` targetting {{ triggerParams.source_branch }}
   - Note the PR ID from the result
5. **Read ALL PR review threads** to understand inline feedback:
   - Use `list-pull-request-threads` with the PR ID from above
{% endif %}

## Create or update state.md

If `state.md` doesn't exist, create it at `.ralph/tasks/{{ taskId }}/state.md`:

```markdown
# Task State: {{ taskId }} — {{ taskTitle }} (REVISION)

## Current Phase
Revision Phase 1-2: Understand Feedback & Find PR

## Completed Phases
(none yet — this is a revision run)

## Feedback Items
- [ ] <feedback item>
- Source: JIRA comment | PR thread | previous handoff

## Key Decisions
(from previous handoff — copy forward only the decisions that still apply)

## Tracked Identifiers
- Branch: ralph/{{ taskId }}-<slug>
- PR URL: {{ prUrl }}
(page identifiers from previous run)

## Source References
(from previous handoff — copy relevant references here)

## Previous Run Summary
(what the previous attempt accomplished, in 3-5 bullets)

## Task Plan
- Planner status: not started
- Task index: not created yet

## Current Task
(none yet)

## Completed Tasks
(none yet)

## Notes
(anything else)
```

## Before moving to Revision Phase 3

Update `state.md`:
- Set "Current Phase" to `Revision Phase 3: Implement Fixes`
- Add Revision Phases 1-2 to "Completed Phases" with feedback summary
- List all feedback items under "Feedback Items"
- Record the PR URL and branch name in "Tracked Identifiers"
- Record any prior handoff decisions the writer must preserve
{%- else %}
<!-- This file is for the revision workflow. You are running a standard workflow — this file is intentionally empty. -->
{%- endif %}
