{%- if isRevision %}
# Revision Phase 1: Understand Feedback & Find PR

## Before you begin

1. **Read `state.md`** at `.ralph/tasks/{{ taskId }}/state.md` — if it doesn't exist, create it (see below).
2. This reference is for **Revision Phase 1**.

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

### PR and branch strategy

1. **You are already on the correct branch.**{% if triggerParams.branch %} The branch is `{{ triggerParams.branch }}`.{% endif %} Do NOT switch branches or create a new one.

2. **Find the existing PR** using `ado_list_pull_requests`, filtering by the source branch

3. **Read ALL PR review threads** using `ado_list_pull_request_threads` with the PR ID

### Create or update state.md

Create or update `.ralph/tasks/{{ taskId }}/state.md`:

```markdown
# Task State: {{ taskId }} — {{ taskTitle }} (REVISION)

## Current Phase
Revision Phase 1: Understand Feedback

### Reference file for this phase
- references/r1-setup.md

> ⚠️ STOP — Read the reference file listed above BEFORE doing any work in this phase.

## Feedback Summary
<!-- List each item the reviewer wants fixed -->

## Tracked Identifiers
- Branch: <branch name>
- PR ID: <PR ID>
- PR URL: <PR URL>

## Completed Phases
(none yet)
```

4. **Create the artifacts directory** at `.ralph/tasks/{{ taskId }}/artifacts/` — this is where subagent artifacts will be written.

## Before moving to Revision Phase 2

Update `state.md`:
- Set "Current Phase" to `Revision Phase 2: Analyze Revision`
- Set "Reference file for this phase" to `references/2-analyze.md`
- Add Revision Phase 1 to "Completed Phases" with feedback summary
{%- else %}
<!-- This file is for the revision workflow. You are running a standard workflow — see references/1-setup.md instead. -->
{%- endif %}
