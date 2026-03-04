---
name: vscode-workflow-setup
description: "VS Code extension workflow Phase 1. Read this skill at the start of every new (non-revision) task. Covers state.md initialization, ralphchives search, greeting, and analyst delegation for implementation path research."
---

# Phase 1: Setup

## Before you begin

1. **Read `state.md`** at `.ralph/tasks/{{ taskId }}/state.md` — if this is Phase 1, the file doesn't exist yet. Create it below.
2. This skill is for **Phase 1: Setup**. If you've already completed setup, skip to the next phase.

## Context

The orchestrator has already:
- Created a task branch (`ralph/{{ taskId }}-...`) from `main`
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

### Skills for this phase
- vscode-workflow-setup

> ⚠️ STOP — Read every skill listed above BEFORE doing any work in this phase.

## Completed Phases
(none yet)

## Key Decisions
(record each decision and its rationale)

## Tracked Identifiers
- Branch: (run `git branch --show-current` and record here)
(PR IDs — add as you go)

## Ralphchives Findings
(prior work from archived task reports)

## Notes
(anything else)
```

4. **Search ralphchives** (skill: **ralph-ralphchives**) for prior work related to this issue — component names, feature areas, error patterns. Note useful findings in `state.md`.

5. **Post a greeting comment** on **{{ taskId }}** — introduce yourself, acknowledge the task, and show some personality. Use rich wiki markup formatting.

6. **Read `.github/copilot-instructions.md`** in the target repo to orient yourself in the codebase.

7. **Delegate analysis to the `ralph-analyst` sub-agent** — pass the full JIRA issue details (key, summary, description) and let it research the codebase and suggest an implementation path. Review its analysis before proceeding.

   **Trust but verify.** The analyst runs on a smaller, faster model and may produce inaccurate file paths, hallucinated APIs, or outdated information. Before using any sub-agent output, spot-check critical claims: verify that referenced files exist, confirm code snippets match the actual source, and validate any type signatures or function names against the codebase.

8. Plan your approach based on the analyst's suggestions (you have final authority — adjust the plan as needed). Record the plan in `state.md`.

## Before moving to Phase 2

Update `state.md`:
- Set "Current Phase" to `Phase 2: Execute`
- Set "Skills for this phase" to:
  - vscode-workflow-execute
- Keep the reminder line: `> ⚠️ STOP — Read every skill listed above BEFORE doing any work in this phase.`
- Add Phase 1 to "Completed Phases" with branch name and analysis summary
- Record any ralphchives findings
