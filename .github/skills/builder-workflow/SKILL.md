---
name: builder-workflow
description: "Router for the Builder orchestrator workflow — a 5-phase plan execution pipeline that dispatches subagents to implement phased plans. Read this skill at the start of every builder session and at every phase transition. Use when executing a phased plan, when state.md shows any phase (setup, parse, execute, verify, report), when the builder needs to dispatch subagents, or when creating or understanding plan format. Also read `references/plan-format.md` when creating new plans or when the builder-planner needs to parse a plan."
---

# Builder Workflow

A 5-phase plan execution pipeline that takes a phased implementation plan and executes it end-to-end by dispatching subagents. Read `state.md` to determine your current phase, then read the corresponding reference file.

## Workflow

| Phase | Reference file | Summary |
|-------|---------------|---------|
| 1. Setup | `references/1-setup.md` | Validate plan directory, create artifact dirs, initialize state.md and manifest.json |
| 2. Parse | `references/2-parse.md` | Dispatch builder-planner subagent, read status.json, record outcome |
| 3. Execute | `references/3-execute.md` | Loop through plan phases — dispatch implementer + reviewer per phase with iteration tracking |
| 4. Verify | `references/4-verify.md` | Dispatch builder-verifier with the plan's verification checklist |
| 5. Report | `references/5-report.md` | Dispatch builder-scribe, print completion summary |

## Reference

| Document | Reference file | When to read |
|----------|---------------|--------------|
| Plan Format | `references/plan-format.md` | When creating new plans or when the builder-planner needs to parse plan structure |

## How to Use

1. **Starting a new execution**: Read `references/1-setup.md` and begin Phase 1
2. **Resuming a session**: Read `state.md` in the artifact directory to find your current phase, then read the matching reference file
3. **After completing a phase**: Update `state.md` with the next phase, then read the next reference file
4. **Creating a new plan**: Read `references/plan-format.md` for the plan directory structure and conventions
