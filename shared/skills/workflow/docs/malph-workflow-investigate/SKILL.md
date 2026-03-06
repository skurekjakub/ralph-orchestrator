---
name: malph-workflow-investigate
description: "Malph review workflow Phase 3. Read this skill after studying the reference files. Covers checking out the PR branch, running git diff, and reading every changed file in full — not just the diff. The diff hides critical context. Never judge a file from its diff alone."
---

# Phase 3: Investigate

## Before you begin

1. **Read `state.md`** at `.ralph/tasks/{{ taskId }}/state.md`
2. This skill is for **Phase 3: Investigate**. If you've already completed this phase, skip to the next.

## Instructions

1. **You are already on the correct branch.**{% if triggerParams.branch %} The branch is `{{ triggerParams.branch }}`.{% endif %}
2. **Run `git diff main...<branch>`** to see all changes
3. **Read each changed file in full** — don't rely solely on the diff. The devil is in what the diff doesn't show. The diff hides critical context: surrounding headings, page structure, existing content that the change interacts with.
4. **Record findings immediately.** As you read each file, write any issues you notice to the "Review Findings" section of `state.md` right away — with the issue code (`STY-XXX`, `ACC-XXX`, `REQ-XXX`, `SUG-XXX`), file path, and the specific problem. Do not rely on remembering them for Phase 5. Context fades; `state.md` does not.
5. Consider relationships with files that may have been overlooked — are there related pages that should have been updated but weren't?

## Before moving to Phase 4

Update `state.md`:
- Set "Current Phase" to `Phase 4: Verify Technical Claims`
- Set "Skills for this phase" to:
  - malph-workflow-verify
- Add Phase 3 to "Completed Phases" — note which files were examined and any initial observations
