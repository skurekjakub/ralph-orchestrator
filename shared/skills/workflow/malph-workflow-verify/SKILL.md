---
name: malph-workflow-verify
description: "Malph review workflow Phase 4. Read this skill after investigating the diff. Covers delegating technical claim verification to the malph-investigator sub-agent, corroborating findings with Microsoft documentation, and preserving source URLs. Every accuracy finding in your review must pass through this phase first."
---

# Phase 4: Verify Technical Claims

## Before you begin

1. **Read `state.md`** at `resources/chats/{{ taskId }}/state.md`
2. This skill is for **Phase 4: Verify Technical Claims**. If you've already completed this phase, skip to the next.

## Instructions

Before judging the content, verify the technical claims in the diff:

1. **Identify every functional or behavioral claim**, API signature, class name, configuration value, and code example in the changed files.
2. **Delegate to the `malph-investigator` sub-agent** — pass the specific technical claims that need verification. The investigator searches the Xperience source code and returns a verification report with source browser URLs.
3. **Review the investigator's findings** — verify it contains all expected sections:
   - **Verified**: claims confirmed against source (with URLs)
   - **Discrepancies**: claims that conflict with source (with evidence)
   - **Could Not Verify**: claims where source was inconclusive

   For every item in "Discrepancies", open the cited source location and confirm the discrepancy yourself before including it in your review. False positives in your review undermine trust in the entire process.
4. **Corroborate with Microsoft documentation** — use the `microsoft_docs_search` MCP tool to find relevant pages, then `web_fetch` to retrieve their full content. Use this to cross-check technical claims, API behavior, or platform details that the source code alone doesn't clarify. You do not have any other internet access.
5. **Preserve source URLs** from the investigator's report — you'll need them in Phase 6 for the JIRA comment. Every verified claim should link back to the exact source location.
6. Incorporate verified discrepancies into your review as blockers.

## Before moving to Phase 5

Update `state.md`:
- Set "Current Phase" to `Phase 5: Review`
- Set "Skills for this phase" to:
  - malph-workflow-review
- Add Phase 4 to "Completed Phases"
- Record the investigator's full report under "Investigator Findings"
- Note any corroborating or conflicting info from Microsoft docs
