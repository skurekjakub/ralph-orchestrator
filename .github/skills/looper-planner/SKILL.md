---
name: looper-planner
description: "Router for the Looper Planner workflow — a 5-phase planning process that takes a change request through discovery, clarifying questions, specification, implementation plan, and task breakdown. Read this skill at the start of every planning session and at every phase transition. Use when starting a new planning session, when state.md shows any phase (1–5), when the user wants to plan a change request, or when the planner needs to ask questions, write a spec, create a plan, or break work into tasks."
---

# Looper Planner

A 5-phase planning workflow that transforms a change request into executable task files. Read `state.md` to determine your current phase, then read the corresponding reference file.

## Workflow

| Phase | Reference file | Summary |
|-------|---------------|---------|
| 1. Discovery | `references/1-discovery.md` | Read the change request, gather project context, initialize state.md |
| 2. Questions | `references/2-questions.md` | Iterate clarifying questions with the user until ambiguities are resolved |
| 3. Specification | `references/3-spec.md` | Write the specification (WHAT), present for user approval |
| 4. Plan | `references/4-plan.md` | Write the implementation plan (HOW), present for user approval |
| 5. Task Breakdown | `references/5-tasks.md` | Break the plan into 5–15 independent, self-contained task files |

## How to Use

1. **Starting a new session**: Read `references/1-discovery.md` and begin Phase 1
2. **Resuming a session**: Read `state.md` in the working directory to find your current phase, then read the matching reference file
3. **After completing a phase**: Update `state.md` with the next phase, then read the next reference file
4. **Phase transitions**: Each reference file ends with "Before moving to Phase N" instructions — follow them to update `state.md` and proceed
