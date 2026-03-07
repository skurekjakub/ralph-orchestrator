---
name: malph-workflow-investigate
description: "Malph review workflow Phase 3. Read this skill after studying the reference files. Dispatch the malph-scout sub-agent to map the PR, capture requirement-coverage risks, and run the docs build before the panel review begins."
---

# Phase 3: Investigate

## Before you begin

1. **Read `state.md`** at `.ralph/tasks/{{ taskId }}/state.md`
2. This skill is for **Phase 3: Investigate**. If you've already completed this phase, skip to the next.

## Instructions

1. **You are already on the correct branch.**{% if triggerParams.branch %} The branch is `{{ triggerParams.branch }}`.{% endif %}
2. **Dispatch `malph-scout`** to build the shared review context. The scout must return:
  - PR/branch context
  - Changed file list
  - Requirement coverage notes
  - Build status
  - Focus areas for the reviewers
3. **Record the scout output** in `state.md` under "Scout Findings" from `scout-findings.json`, and copy the changed file list into "Key Context".
4. If the scout returns `build-broken`, preserve that as a blocking finding for the final verdict.

## Before moving to Phase 4

Update `state.md`:
- Set "Current Phase" to `Phase 4: Verify Technical Claims`
- Set "Skills for this phase" to:
  - malph-workflow-verify
- Add Phase 3 to "Completed Phases" — note the scout result, build status, and changed files
