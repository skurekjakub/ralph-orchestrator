---
name: ralph-workflow-setup
description: "Standard workflow Phase 1. Read this skill at the start of every new (non-revision) task. Covers branch creation, workload directory setup, state.md initialization with skill manifest, and ralphchives search for prior work. Always the first phase — if state.md doesn't exist yet, you're here."
---

# Phase 1: Setup

## Before you begin

1. **Read `state.md`** at `.ralph/tasks/{{ taskId }}/state.md` — if this is Phase 1, the file doesn't exist yet. Create it below.
2. This skill is for **Phase 1: Setup**. If you've already completed setup, skip to the next phase.

## Instructions

1. **You are working on {{ taskId }}: {{ taskTitle }}**. Parse the full issue details from your prompt — extract the description, acceptance criteria, and any linked resources.
2. **Create a fresh branch** from `{%- if triggerParams.source_branch %}{{ triggerParams.source_branch }}{%- else %}main{%- endif %}`:
   Example: `ralph/{{ taskId }}-<short-slug>`
3. **Create the workload directory**: `.ralph/tasks/{{ taskId }}/`
4. **Create the scratchpad file** at `.ralph/tasks/{{ taskId }}/state.md` using this template:

```markdown
# Task State: {{ taskId }} — {{ taskTitle }}

## Current Phase
Phase 1: Setup

### Skills for this phase
- ralph-workflow-setup

> ⚠️ STOP — Read every skill listed above BEFORE doing any work in this phase.

## Completed Phases
(none yet)

## Key Decisions
(record each decision and its rationale)

## Tracked Identifiers
- Branch: ralph/{{ taskId }}-<short-slug>
(page identifiers, PR IDs — add as you go)

## Source References
(exact source locations backing documentation claims)

## Ralphchives Findings
(prior work from archived task reports)

## Notes
(anything else)
```

5. **Search ralphchives** (skill: **ralph-ralphchives**) for prior work related to this issue — component names, feature areas, error patterns. Note useful findings in `state.md`. Search by {{ taskId }} primarily.
6. Comment on **{{ taskId }}** that you're starting work.

## Before moving to Phase 2

Update `state.md`:
- Set "Current Phase" to `Phase 2: Research`
- Set "Skills for this phase" to:
  - ralph-workflow-research
- Keep the reminder line: `> ⚠️ STOP — Read every skill listed above BEFORE doing any work in this phase.`
- Add Phase 1 to "Completed Phases" with branch name and setup outcomes
- Record any ralphchives findings
