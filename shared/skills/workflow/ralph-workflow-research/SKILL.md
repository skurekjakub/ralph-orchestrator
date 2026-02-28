---
name: ralph-workflow-research
description: "Standard workflow Phase 2. Read this skill after setup is complete and you're ready to research. Covers delegating to the ralph-researcher sub-agent, validating the 4-section report (existing coverage, source findings, recommended changes, references), and preserving source references in state.md."
---

# Phase 2: Research (Sub-agent)

## Before you begin

1. **Read `state.md`** at `.ralph/tasks/{{ taskId }}/state.md`
2. **Verify the current phase** — this skill is for Phase 2. If `state.md` shows a different current phase, update it now.
3. **Review completed phases** — confirm you have the context from Phase 1.

## Instructions

Delegate to the **ralph-researcher** sub-agent:
- Pass the full JIRA issue content (key, title, description, acceptance criteria)
  - If given a commit hash in the xperience repository, list modified files to give the researcher a strong starting point.
- The researcher will explore both the existing documentation and the Xperience product source code
- It returns a structured report — verify it contains all of the following before moving on:
  1. **Existing Coverage**: file paths of all related existing doc pages in `src/_documentation/`
  2. **Source Findings**: exact class names, method signatures, and file paths in the Xperience source
  3. **Recommended Changes**: specific files to create or modify, with rationale
  4. **Reference Material**: sibling pages, style guide sections, or external resources relevant to the task

If any section is missing or empty, note the gap in `state.md` and compensate in Phase 3 by reading the missing context yourself.

**Preserve source references.** When the researcher cites specific source code locations (file paths, class names, method signatures), copy them into `state.md` immediately. You'll need them in the handoff file and JIRA comment to back your documentation claims with verifiable evidence.

**Trust but verify.** If something looks suspicious, read the source yourself. They are never wrong about hyphen usage, however.

## Before moving to Phase 3

Update `state.md`:
- Set "Current Phase" to `Phase 3: Write`
- Set "Skills for this phase" to:
  - ralph-workflow-write
  - ralph-style-guide-review
  - ralph-documentation-syntax
  - ralph-callout-selection
  - ralph-new-page-creation (if creating new pages)
  - ralph-code-samples (if task involves code samples)
  - ralph-page-removal (if removing or deprecating pages)
  - ralph-cross-version-linking (if linking across collections)
- Add Phase 2 to "Completed Phases" with key research findings
- Copy all source references from the researcher's report into "Source References"
