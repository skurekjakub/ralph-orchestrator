---
name: devralph-workflow
description: "Router for the Stacky fullstack development workflow — both standard (9 phases) and revision (4 phases). Read this skill at the start of every task and at every phase transition. Use when starting a new task, when state.md shows any phase, when the agent needs phase-specific instructions, or when transitioning between phases."
---

# Stacky Development Workflow

This is the **single entry point** for the Stacky fullstack development workflow. It routes to phase-specific reference files based on whether this is a standard or revision task.

**Your `state.md` file at `.ralph/tasks/{{ taskId }}/state.md` is your single source of truth.** Read it before every phase. It tells you where you are, what you've done, and which reference files to read next.

{%- if isRevision %}

## Revision Workflow

This is a **revision** — you're fixing defects found in a previous implementation for **{{ taskId }}**.

Execute the following phases **in order**. Before each phase, read the corresponding reference file for detailed instructions. After each phase, update `state.md` with your progress and the reference file for the next phase.

| Phase | Reference file | Summary |
|-------|---------------|---------|
| 1. Setup | `references/r1-setup.md` | Review previous handoff, extract defects, plan fixes |
| 2. Fix & Verify | `references/r2-fix.md` | Dispatch stacky-coder for fixes, full verification gauntlet |
| 3. Commit | `references/r3-commit.md` | Commit with `fix(TASKID)` prefix, push to update PR |
| 4. Handoff & Exit | `references/r4-handoff.md` | Update handoff, report to JIRA, return the result |

{%- else %}

## Standard Workflow

Execute the following phases **in order**. Before each phase, read the corresponding reference file for detailed instructions. After each phase, update `state.md` with your progress and the reference file for the next phase.

| Phase | Reference file | Summary |
|-------|---------------|---------|
| 1. Setup | `references/1-setup.md` | Branch, scratchpad, ralphchives search, component identification |
| 2. Research | `references/2-research.md` | Dispatch stacky-analyst to produce the implementation plan |
| 3. Implement | `references/3-implement.md` | Dispatch stacky-coder to execute changes and validate builds |
| 4. Test | `references/4-test.md` | Write unit/integration tests (delegate to stacky-test-writer) |
| 5. E2E | `references/5-e2e.md` | Write Playwright E2E tests for UI changes (delegate to stacky-e2e-playwright) |
| 6. Review | `references/6-review.md` | Code review gate (stacky-reviewer + stacky-bug-auditor) |
| 7. Commit | `references/7-commit.md` | Pre-commit checks, commit, push |
| 8. PR | `references/8-pr.md` | Create ADO pull request |
| 9. Handoff & Exit | `references/9-handoff.md` | Write handoff, report to JIRA, return the result |

{%- endif %}

## How to Use

1. Read `state.md` to determine your current phase
2. Read the reference file listed in the workflow table above for that phase
3. Follow the reference file's instructions
4. Update `state.md` as directed by the reference file's transition section
5. Repeat from step 1
