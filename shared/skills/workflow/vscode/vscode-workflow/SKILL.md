---
name: vscode-workflow
description: "Router for the VS Code extension agent workflow — both standard and revision. Read this skill at the start of every task and at every phase transition. Use when starting a new task, when state.md shows any phase, when the agent needs phase-specific instructions, or when transitioning between phases. Also read the `references/test-guide.md` when writing or reviewing tests."
---

# VS Code Extension Workflow

This is the **single entry point** for the VS Code extension agent workflow. It routes to phase-specific reference files based on whether this is a standard or revision task.

**Your `state.md` file at `.ralph/tasks/{{ taskId }}/state.md` is your single source of truth.** Read it before every phase. It tells you where you are, what you've done, and which reference files to read next.

## Artifact Contract

All subagent communication follows the **agent-as-function** pattern:

- **Artifact root**: `.ralph/tasks/{{ taskId }}/artifacts/`
- **Each subagent** writes to its own subdirectory (e.g. `ralph-analyst/`, `ralph-coder/`, `ralph-reviewer/`)
- **status.json**: The ONLY file the orchestrator reads from each subagent. Contains `agent`, `task_id`, `status`, `result`, `summary`, `artifacts`, `next_hint`, `iteration`.
- **manifest.json**: Append-only audit log at the artifact root. Each subagent appends an entry.
- **Iterative versioning**: Coder writes `output-v1.md`, `output-v2.md`; reviewer writes `output-v1.md` per iteration. `status.json` is overwritten each iteration.

**Purity rule**: The orchestrator routes on `status.json` fields only. Never read subagent `output.md` files — downstream subagents read each other's artifacts directly.

{%- if isRevision %}

## Revision Workflow

Execute the following phases **in order**. Before each phase, read the corresponding reference file for detailed instructions. After each phase, update `state.md` with your progress and the reference file for the next phase.

| Phase | Reference file | Summary |
|-------|---------------|---------|
| 1. Understand Feedback | `references/r1-setup.md` | Read reviewer feedback, find existing PR & branch |
| 2. Analyze Revision | `references/2-analyze.md` | Dispatch analyst in revision mode, read status.json |
| 3. Fix & Review | `references/3-implement-loop.md` | Dispatch coder → reviewer loop (max 2 iterations) |
| 4. Package | `references/4-package.md` | Bump patch version, update CHANGELOG, build .vsix |
| 5. Commit & Respond | `references/r5-commit.md` | Commit, push, reply to PR threads |
| 6. Handoff | `references/r6-handoff.md` | Update handoff, report to JIRA |
| 7. Archive & Exit | `references/8-archive.md` | Dispatch scribe, print exit block |

{%- else %}

## Standard Workflow

Execute the following phases **in order**. Before each phase, read the corresponding reference file for detailed instructions. After each phase, update `state.md` with your progress and the reference file for the next phase.

| Phase | Reference file | Summary |
|-------|---------------|---------|
| 1. Setup | `references/1-setup.md` | Branch verify, state.md init, JIRA greeting |
| 2. Analyze | `references/2-analyze.md` | Dispatch analyst, read status.json |
| 3. Implement & Review | `references/3-implement-loop.md` | Dispatch coder → reviewer loop (max 2 iterations) |
| 4. Package | `references/4-package.md` | Bump patch version, update CHANGELOG, build .vsix |
| 5. Commit & Push | `references/5-commit.md` | Pre-commit build, commit, push via MCP |
| 6. PR | `references/6-pr.md` | Create ADO pull request |
| 7. Handoff | `references/7-handoff.md` | Write handoff, report to JIRA |
| 8. Archive & Exit | `references/8-archive.md` | Dispatch scribe, print exit block |

{%- endif %}

## Domain Reference

| Reference file | When to read |
|---------------|-------------|
| `references/test-guide.md` | When writing or reviewing tests (coder & reviewer subagents) |

## How to Use

1. Read `state.md` to determine your current phase
2. Read the reference file listed in the workflow table above for that phase
3. Follow the reference file's instructions
4. Update `state.md` as directed by the reference file's transition section
5. Repeat from step 1
