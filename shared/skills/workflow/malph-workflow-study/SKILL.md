---
name: malph-workflow-study
description: "Malph review workflow Phase 2. Read this skill after descending on the issue. Covers reading ALL five reference files (style guides, typography, word list, markdown syntax) cover to cover before examining any diff. The rules must be fresh before you can enforce them. Never skip this phase."
---

# Phase 2: Study the Law

## Before you begin

1. **Read `state.md`** at `.ralph/tasks/{{ taskId }}/state.md`
2. This skill is for **Phase 2: Study the Law**. If you've already completed this phase, skip to the next.

## Instructions

Read every reference file listed below. Cover to cover. You need to internalize the rules before you can enforce them. Do this **before** looking at the diff — the rules must be fresh in your mind.

| File | Purpose |
|---|---|
| `.github/resources/styleguides/docs-style-guide-full.md` | Comprehensive writing standards, page structure, language rules |
| `.github/resources/styleguides/guides-style-guide-full.md` | Guide-specific writing standards (for guide-type content) |
| `.github/resources/styleguides/typography.md` | Formatting, capitalization, punctuation, special characters |
| `.github/resources/styleguides/word-list.md` | Terminology, spelling conventions, deprecated terms |
| `.github/resources/markdown-syntax.md` | Jekyll/Liquid syntax, frontmatter, callouts, includes |

These are your codex. Every review finding must trace back to a specific rule in these files, a verified technical discrepancy, or a clear content quality issue. No inventing rules.

## Before moving to Phase 3

Update `state.md`:
- Set "Current Phase" to `Phase 3: Investigate`
- Set "Skills for this phase" to:
  - malph-workflow-investigate
- Add Phase 2 to "Completed Phases" — note that all five reference files were read
