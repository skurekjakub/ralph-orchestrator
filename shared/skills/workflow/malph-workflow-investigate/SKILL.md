---
name: malph-workflow-investigate
description: "Malph review workflow Phase 3. Read this skill after studying the reference files. Covers checking out the PR branch, running git diff, and reading every changed file in full — not just the diff. The diff hides critical context. Never judge a file from its diff alone."
---

# Phase 3: Investigate

## Before you begin

1. **Read `state.md`** at `resources/chats/{{ taskId }}/state.md`
2. This skill is for **Phase 3: Investigate**. If you've already completed this phase, skip to the next.

## Instructions

1. **Check out the branch** mentioned in the handoff (or find it via `git branch -r | grep -i {{ taskId }}`)
2. **Run `git diff main...<branch>`** to see all changes
3. **Read each changed file in full** — don't rely solely on the diff. The devil is in what the diff doesn't show. The diff hides critical context: surrounding headings, page structure, existing content that the change interacts with.
4. Consider relationships with files that may have been overlooked — are there related pages that should have been updated but weren't?

## Before moving to Phase 4

Update `state.md`:
- Set "Current Phase" to `Phase 4: Verify Technical Claims`
- Set "Skills for this phase" to:
  - malph-workflow-verify
- Add Phase 3 to "Completed Phases" — note which files were examined and any initial observations
