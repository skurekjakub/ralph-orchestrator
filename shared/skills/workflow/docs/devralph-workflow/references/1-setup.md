{%- unless isRevision %}

# Phase 1: Setup

## Before you begin

1. **Read `state.md`** at `.ralph/tasks/{{ taskId }}/state.md` — if this is Phase 1, the file doesn't exist yet. Create it below.
2. This reference is for **Phase 1: Setup**. If you've already completed setup, skip to the next phase.

## Context

The orchestrator has already:
- Created a task branch (`ralph/{{ taskId }}-...`) from `{%- if triggerParams.source_branch %}{{ triggerParams.source_branch }}{%- else %}main{%- endif %}`
- Created the workload directory at `.ralph/tasks/{{ taskId }}/`

You are already on the correct branch. Do **not** create a new branch or switch branches.

## Instructions

1. **You are working on {{ taskId }}: {{ taskTitle }}**. Parse the full issue details from your prompt — extract the description, acceptance criteria, and any technical requirements.

2. **Verify the workspace** — confirm you're on a `ralph/{{ taskId }}-*` branch and `.ralph/tasks/{{ taskId }}/` exists.

3. **Create the scratchpad file** at `.ralph/tasks/{{ taskId }}/state.md`:

```markdown
# Task State: {{ taskId }} — {{ taskTitle }}

## Current Phase
Phase 1: Setup

### Reference file for this phase
- references/1-setup.md

> ⚠️ STOP — Read the reference file listed above BEFORE doing any work in this phase.

## Completed Phases
(none yet)

## Affected Components
- [ ] Ruby gems (which ones?)
- [ ] Gulp pipeline
- [ ] Frontend JS (which bundle?)
- [ ] CSS (Less / Tailwind / both)
- [ ] Jekyll layouts/includes
- [ ] Collections/content
- [ ] Configuration
- [ ] Tests

## Key Decisions
(record each decision and its rationale)

## Tracked Identifiers
- Branch: (run `git branch --show-current` and record here)
(file paths, PR IDs — add as you go)

## Source References
(code locations backing your changes)

## Ralphchives Findings
(prior work from archived task reports)

## Notes
(anything else)
```

4. **Search ralphchives** (skill: **ralph-ralphchives**) for prior work related to this issue — component names, feature areas, error patterns. Previous task runs may have documented solutions, gotchas, or relevant implementation patterns for the same codebase area. Note useful findings in `state.md`.

5. **Identify affected components** — Based on the issue description, check which parts of the stack are involved (gems, gulp, JS, CSS, Jekyll templates, etc.) and update `state.md`.

6. Comment on **{{ taskId }}** that you're starting work.

## Before moving to Phase 2

Update `state.md`:
- Set "Current Phase" to `Phase 2: Research`
- Set "Reference file for this phase" to `references/2-research.md`
  - Also list domain skills matching affected components (e.g. devralph-ruby-gems, devralph-frontend)
- Keep the reminder line
- Add Phase 1 to "Completed Phases" with branch name and setup outcomes
- Record ralphchives findings and affected components

{%- else %}
<!-- This file is for the standard workflow. You are running a revision workflow — this file is intentionally empty. -->
{%- endunless %}
