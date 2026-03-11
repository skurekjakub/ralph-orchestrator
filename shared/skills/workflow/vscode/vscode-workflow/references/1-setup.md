{%- unless isRevision %}
# Phase 1: Setup

## Before you begin

This is the first phase — no prior phases to check.

## Instructions

1. **Verify the branch** — confirm you are on the correct task branch. Run `git branch --show-current` and record it.

2. **Initialize `state.md`** at `.ralph/tasks/{{ taskId }}/state.md`:

```markdown
# Task State: {{ taskId }} — {{ taskTitle }}

## Current Phase
Phase 1: Setup

### Reference file for this phase
- references/1-setup.md

> ⚠️ STOP — Read the reference file listed above BEFORE doing any work in this phase.

## Completed Phases
(none yet)

## Key Decisions
(record each decision and its rationale)

## Tracked Identifiers
- Branch: (run `git branch --show-current` and record here)
(PR IDs — add as you go)

## Notes
(anything else)
```

3. **Post a greeting comment** on **{{ taskId }}** — introduce yourself, acknowledge the task, and show some personality. Use rich wiki markup formatting.

4. **Create the artifacts directory** at `.ralph/tasks/{{ taskId }}/artifacts/` — this is where subagent artifacts will be written.

## Before moving to Phase 2

Update `state.md`:
- Set "Current Phase" to `Phase 2: Analyze`
- Set "Reference file for this phase" to `references/2-analyze.md`
- Keep the reminder line
- Add Phase 1 to "Completed Phases" with branch name
{%- else %}
<!-- This file is for the standard workflow. You are running a revision workflow — this file is intentionally empty. -->
{%- endunless %}
