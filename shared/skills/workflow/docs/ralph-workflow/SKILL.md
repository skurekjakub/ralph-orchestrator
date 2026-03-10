---
name: ralph-workflow
description: "Router for the Ralph documentation workflow — both standard (8 phases) and revision (7 phases). Read this skill at the start of every task and at every phase transition. It tells you which reference file to read for detailed phase instructions. Covers setup, research, write, review, commit, PR, and handoff phases. Always use this skill when working on any ralph documentation task — it's the single entry point for all workflow phases."
---

# Ralph Documentation Workflow

This skill routes you to the correct phase instructions. Read the reference file for your current phase — each contains full instructions including the "Before moving to Phase N" checklist.

**Your `state.md` file at `.ralph/tasks/{{ taskId }}/state.md` is your single source of truth.** Read it before every phase.

---

{%- if isRevision %}

## Revision Workflow

**This is a revision of a previous attempt for {{ taskId }}.** A human reviewer has looked at your previous work, found issues, and transitioned the JIRA issue back for fixes.

| Phase | Reference file | Summary |
|-------|---------------|---------|
| 1–2. Setup | `references/r1-setup.md` | Understand feedback, find existing branch & PR |
| 3. Fix | `references/r3-fix.md` | Dispatch ralph-writer in revision mode to implement fixes |
{%- unless triggerParams.skip_review %}
| 4. Review | `references/4-review.md` | Three-reviewer gate (technical, style, IA), revision loop |
{%- endunless %}
| 5. Commit | `references/r5-commit.md` | Commit, push, respond to PR threads |
| 6–7. Handoff & Exit | `references/r6-handoff.md` | Update handoff, JIRA comment, exit block |

{%- else %}

## Standard Workflow

| Phase | Reference file | Summary |
|-------|---------------|---------|
| 1. Setup | `references/1-setup.md` | Branch, scratchpad, ralphchives search |
{%- if triggerParams.codesamples and triggerParams.xpversion %}
| 1b. Coder | _(use ralph-codesamples-bootstrap skill)_ | Dispatch ralph-coder to bootstrap the codesamples .NET project |
{%- endif %}
| 2. Research | `references/2-research.md` | Dispatch ralph-researcher to produce the research report |
| 3. Write | `references/3-write.md` | Dispatch ralph-writer to implement changes |
{%- unless triggerParams.skip_review %}
| 4–5. Review | `references/4-review.md` | Three-reviewer gate (technical, style, IA), revision loop |
{%- endunless %}
| 6. Commit | `references/6-commit.md` | Pre-commit checks, commit, push |
| 7. PR | `references/7-pr.md` | Create ADO pull request |
| 8. Handoff & Exit | `references/8-handoff.md` | Dispatch ralph-scribe, deliver to JIRA, print exit block |

{%- endif %}

## How to use

1. Read `state.md` to determine your current phase
2. Read the reference file listed in the table above for that phase
3. Follow the instructions in the reference file
4. Update `state.md` as directed by the reference file's "Before moving to Phase N" section
5. Return here and repeat for the next phase
