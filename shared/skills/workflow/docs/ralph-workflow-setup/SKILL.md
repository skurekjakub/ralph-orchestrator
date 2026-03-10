---
name: ralph-workflow-setup
description: "Standard workflow Phase 1. Read this skill at the start of every new (non-revision) task. Covers state.md initialization with skill manifest, and ralphchives search for prior work. Always the first phase — if state.md doesn't exist yet, you're here."
---

# Phase 1: Setup

## Before you begin

1. **Read `state.md`** at `.ralph/tasks/{{ taskId }}/state.md` — if this is Phase 1, the file doesn't exist yet. Create it below.
2. This skill is for **Phase 1: Setup**. If you've already completed setup, skip to the next phase.

## Context

The orchestrator has already:
- Created a task branch (`ralph/{{ taskId }}-...`) from `{%- if triggerParams.source_branch %}{{ triggerParams.source_branch }}{%- else %}main{%- endif %}`
- Created the workload directory at `.ralph/tasks/{{ taskId }}/`

You are already on the correct branch. Do **not** create a new branch or switch branches.

## Instructions

1. **You are working on {{ taskId }}: {{ taskTitle }}**. Parse the full issue details from your prompt — extract the description, acceptance criteria, and any linked resources.
2. **Verify the workspace** — confirm you're on a `ralph/{{ taskId }}-*` branch and `.ralph/tasks/{{ taskId }}/` exists. If something is wrong, stop and report the error.
3. **Create the scratchpad file** at `.ralph/tasks/{{ taskId }}/state.md` using this template:

```markdown
# Task State: {{ taskId }} — {{ taskTitle }}

## Current Phase
Phase 1: Setup

## Completed Phases
(none yet)

## Key Decisions
(record each decision and its rationale)

## Tracked Identifiers
- Branch: (run `git branch --show-current` and record here)
(page identifiers, PR IDs — add as you go)

## Source References
(exact source locations backing documentation claims)

## Ralphchives Findings
(prior work from archived task reports)

## Notes
(anything else)
```

4. Comment on **{{ taskId }}** that you're starting work.

## Before moving to Phase 2

Update `state.md`:
- Set "Current Phase" to `Phase 2: Research`
- Add Phase 1 to "Completed Phases" with branch name and setup outcomes
- Record any ralphchives findings
