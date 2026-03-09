---
name: looper-planner-discovery
description: "Looper Planner Phase 1. Read the change request, gather comprehensive project context via scout subagent, and initialize the planning scratchpad. Use when starting a new planning session or when state.md shows Phase 1: Discovery."
---

# Phase 1: Discovery

## Before you begin

1. Identify the working directory: `.agents/changes/<JIRA_ID>-<short-description>/`
2. If `state.md` exists, read it — you may be recovering a crashed session
3. If resuming, skip to wherever the phase left off

## Instructions

### 1. Read the change request

Locate and read `.agents/changes/<JIRA_ID>-<short-description>/00.jira-request.txt`.

If this file doesn't exist:
- Check if the user provided the change description in chat
- If not, ask the user for the JIRA ID and change request
- Do NOT proceed without a clear request

### 2. Gather project context

Use Explore subagents via #runSubAgent or similar to gather:
- Project structure and architecture
- Existing documentation (README, AGENTS.md, memory bank)
- Related code modules and their responsibilities
- Similar features or patterns in the codebase
- Development guidelines and best practices

**Completeness check**: Do NOT proceed until you have 80% confidence in understanding the project landscape. If confidence is low, identify the gaps and explore further.

### 3. Initialize the scratchpad

Create `state.md` in the working directory:

```markdown
# Planner State: <JIRA_ID> — <short-description>

## Current Phase
Phase 1: Discovery

### Skills for this phase
- looper-planner-discovery

## Working Directory
`.agents/changes/<JIRA_ID>-<short-description>/`

## Completed Phases
(none)

## Question Rounds
Round: 0
Unresolved: (not yet assessed)

## Key Decisions
(none yet)

## Notes
(none)
```

## Before moving to Phase 2

Update `state.md`:
- Set "Current Phase" to `Phase 2: Questions`
- Set "Skills for this phase" to:
  - looper-planner-questions
- Add Phase 1 to "Completed Phases" with a summary of what was learned
- Note any initial ambiguities or concerns in "Notes"
