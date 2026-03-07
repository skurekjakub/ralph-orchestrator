---
name: malph-workflow-investigate
description: "Malph review workflow Phase 2. Read this skill after descending on the issue. Dispatch the malph-scout sub-agent to map the PR, capture requirement-coverage risks, and run the docs build before the panel review begins."
---

# Phase 2: Investigate

## Before you begin

1. **Read `state.md`** at `.ralph/tasks/{{ taskId }}/state.md`
2. This skill is for **Phase 2: Investigate**. If you've already completed this phase, skip to the next.

## Instructions

1. **You are already on the correct branch.**{% if triggerParams.branch %} The branch is `{{ triggerParams.branch }}`.{% endif %}
2. **Dispatch `malph-scout`** with the task-id and a one-line directive (e.g. "Scout the PR for {{ taskId }}"). The scout reads the PR context, changed files, and build status on its own.
3. After the scout returns, read its `status.json` at `.ralph/tasks/{{ taskId }}/artifacts/malph-scout/status.json`.
4. If the scout returns `blocked`, record the `summary` in `state.md` and stop.
5. If the scout returns `build-broken`, note the build failure in `state.md` — the verdict agent will handle it.

Do **not** read `scout-findings.json` or `output.md`. Downstream subagents read scout artifacts directly from the filesystem.

## Before moving to Phase 3

Update `state.md`:
- Set "Current Phase" to `Phase 3: Verify Technical Claims`
- Set "Skills for this phase" to:
  - malph-workflow-verify
- Add Phase 2 to "Completed Phases" — note the scout's `result` and `summary` from `status.json`
- Record the scout's `result` and `summary` under "Scout Status" in `state.md`
