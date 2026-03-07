---
name: malph-workflow-descend
description: "Malph review workflow Phase 1. Read this skill when starting any review task. Covers reading the JIRA issue, downloading Ralph's handoff, searching ralphchives for prior work, finding the PR, creating state.md, and announcing your arrival. Always the first phase."
---

# Phase 1: Descend

The signal is up. Time to work.

## Before you begin

1. Create `.ralph/tasks/{{ taskId }}/state.md` for tracking your work.
2. This skill is for **Phase 1: Descend**. If you've already completed this phase, skip to the next.

## Context

The orchestrator has already:
- Created a task branch from `{%- if triggerParams.source_branch %}{{ triggerParams.source_branch }}{%- else %}main{%- endif %}`
- Created the workload directory at `.ralph/tasks/{{ taskId }}/`

You are already on the correct branch. Do **not** create a new branch or switch branches.

## Instructions

1. **You are reviewing {{ taskId }}: {{ taskTitle }}.** Read the full issue details from your prompt — understand what was requested, what the acceptance criteria are, and what the scope should be.
2. **Read Ralph's handoff** — it's already in your prompt (injected by the orchestrator as "Previous Handoff File"). This is Ralph's summary of what was done, including the PR link, files changed, and any decisions or caveats.
3. **Search ralphchives** (skill: **ralph-ralphchives**) for prior work, gotchas, or observations related to this issue or its component area.
4. If there's a PR URL in the handoff, note it. If not, check recent branches matching `{{ taskId }}`.
5. **Create the scratchpad file** at `.ralph/tasks/{{ taskId }}/state.md`:

```markdown
# Review State: {{ taskId }} — {{ taskTitle }}

## Current Phase
Phase 1: Descend

### Skills for this phase
- malph-workflow-descend

## Completed Phases
(none yet)

## Key Context
- PR URL: <from handoff>
- Branch: <from handoff>
- Files changed: <list from handoff>

## Ralphchives Findings
(prior work from archived task reports)

## Scout Status
(result + summary from malph-scout status.json — Phase 2)

## Technical Review Status
(result + summary from ralph-reviewer-technical status.json — Phase 3)

## Review Panel Status
(result + summary from style/IA reviewers status.json — Phase 4)

## Panel Verdict
(APPROVED or NEEDS REVISION — determined in Phase 4)

## Verdict Delivery Status
(result + summary from malph-verdict status.json — Phase 5)

## Notes
(anything else)
```

7. **Post your opening comment** to **{{ taskId }}** — announce your presence.

## Before moving to Phase 2

Update `state.md`:
- Set "Current Phase" to `Phase 2: Investigate`
- Set "Skills for this phase" to:
  - malph-workflow-investigate
- Add Phase 1 to "Completed Phases" with PR URL, branch, and file list
- Record any ralphchives findings
