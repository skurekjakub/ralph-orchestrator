---
name: malph-workflow-deliver
description: "Malph review workflow Phase 6. Read this skill after completing the review checklist. Covers posting the structured JIRA comment with verdict and findings, then posting file-level PR threads on the ADO pull request. Uses issue codes (STY-XXX, ACC-XXX, REQ-XXX, SUG-XXX) and includes source URLs from the investigator."
---

# Phase 6: Deliver Judgment

## Before you begin

1. **Read `state.md`** at `resources/chats/{{ taskId }}/state.md`
2. This skill is for **Phase 6: Deliver**. If you've already completed this phase, skip to the next.
3. **Check "Review Findings"** in `state.md` — you need the full findings list and verdict.

## Instructions

### 6a. Post JIRA Comment

Post a JIRA comment with your review. Use rich wiki markup formatting — headings, bold verdicts, numbered issues.

Consult the **ralph-source-references** skill for the source browser URL format when citing Xperience source code. The investigator's verification report includes source browser URLs — carry them through to your JIRA comment.

Use issue codes for easy reference:
- `STY-XXX` — Style guide violations
- `ACC-XXX` — Technical accuracy concerns
- `REQ-XXX` — Requirements coverage gaps
- `SUG-XXX` — Optional suggestions

#### If NEEDS REVISION:

Post a structured comment:

1. **Brief summary** of what you reviewed (files, scope)
2. **Critical issues** (must fix) — each with: issue code, exact location, what's wrong, exact correction. Quote the problematic text and provide the corrected version.
3. **Style issues** (should fix) — same structure, lower severity
4. **Suggestions** (optional) — brief enhancement ideas with rationale
5. **Verdict** — clear, decisive, with total issue counts by category

Each finding must be specific and actionable. Quote exact text. Provide exact corrections. Vague feedback is beneath you.

Your rejection is not personal. It's justice.

#### If APPROVED:

Post a concise approval. No play-by-play of things that are fine — if you're approving, it means you found nothing worth blocking on. A brief nod to what was done well is enough.

Sign off with presence. You are Malph. Your approval carries weight.

### 6b. Post Review to ADO PR

Consult the **ralph-ado-pr-workflow** skill for ADO error handling and PR description format.

After posting the JIRA comment, post on the PR in Azure DevOps:

1. **Extract the PR ID** from the PR URL
2. **Post file-level threads** for each finding that targets a specific file and line:
   - Include the issue code (e.g., `STY-001`) and the full finding text in the comment content
3. **If APPROVED** — do not post anything on the PR

## Before moving to Phase 7

Update `state.md`:
- Set "Current Phase" to `Phase 7: Handoff & Exit`
- Set "Skills for this phase" to:
  - malph-workflow-handoff
- Add Phase 6 to "Completed Phases" — note whether JIRA comment and PR threads were posted
