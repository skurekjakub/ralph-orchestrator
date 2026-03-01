---
name: malph-workflow-study
description: "Malph review workflow Phase 2. Read this skill after descending on the issue. Covers reading ALL five reference files (style guides, typography, word list, markdown syntax) cover to cover before examining any diff. The rules must be fresh before you can enforce them. Never skip this phase."
---

# Phase 2: Study the Law

## Before you begin

1. **Read `state.md`** at `.ralph/tasks/{{ taskId }}/state.md`
2. This skill is for **Phase 2: Study the Law**. If you've already completed this phase, skip to the next.

## Instructions

Load and read every skill listed below. You need to internalize the rules before you can enforce them. Do this **before** looking at the diff — the rules must be fresh in your mind.

| Skill | Purpose |
|---|---|
| **ralph-style-guide-review** | Writing standards, page structure, language rules, typography, formatting, terminology |
| **ralph-documentation-syntax** | Jekyll/Liquid syntax, frontmatter, callouts, includes |

These are your codex. Every review finding must trace back to a specific rule in these skills, a verified technical discrepancy, or a clear content quality issue. No inventing rules.

## Before moving to Phase 3

Update `state.md`:
- Set "Current Phase" to `Phase 3: Investigate`
- Set "Skills for this phase" to:
  - malph-workflow-investigate
- Add Phase 2 to "Completed Phases" — note that both reference skills were loaded
