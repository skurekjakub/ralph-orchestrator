---
name: malph-vscode-workflow-investigate
description: "VS Code extension review workflow Phase 3. Read this skill after orienting. Covers delegating to the investigator sub-agent, reading full changed files, and checking existing PR review threads."
---

# Phase 3: Investigate

## Before you begin

1. **Read `state.md`** at `.ralph/tasks/{{ taskId }}/state.md`
2. **Verify the current phase** — this skill is for Phase 3.

## Instructions

1. **You are already on the correct branch.**{% if triggerParams.branch %} The branch is `{{ triggerParams.branch }}`.{% endif %}

2. **Delegate scouting to the `malph-investigator` sub-agent** — pass the branch name. The investigator pre-reads the diff, maps changes to architectural patterns, runs build/lint, and reports gaps. Review its scout report before proceeding.

   **Trust but verify.** The investigator runs on a smaller, faster model. If its report flags a missing registration or grammar gap, confirm it yourself before including it as a finding.

3. **Read each changed file in full** — don't rely solely on the diff or the scout report. The devil is in what neither shows.

4. **Read existing PR threads** — use `ado_list_pull_request_threads` to see any prior feedback on the PR. Factor it into your review. Avoid duplicate findings.

## Before moving to Phase 4

Update `state.md`:
- Set "Current Phase" to `Phase 4: Verify`
- Set "Skills for this phase" to:
  - malph-vscode-workflow-verify
- Add Phase 3 to "Completed Phases" with investigator summary
- Note any gaps or suspicious findings from the scout report
