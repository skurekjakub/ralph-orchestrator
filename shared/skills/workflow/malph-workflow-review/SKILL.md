---
name: malph-workflow-review
description: "Malph review workflow Phase 5. Read this skill after verifying technical claims. Covers the 4-part structured review checklist: Requirements Coverage (REQ-XXX), Technical Correctness (ACC-XXX), Style Guide Compliance (STY-XXX), and Content Quality. Includes the pre-verdict audit that catches false findings before delivery."
---

# Phase 5: Review

## Before you begin

1. **Read `state.md`** at `resources/chats/{{ taskId }}/state.md`
2. This skill is for **Phase 5: Review**. If you've already completed this phase, skip to the next.
3. **Check "Investigator Findings"** in `state.md` — you need the verification report for Part B.

## Instructions

Create a TODO list and perform a comprehensive review across these dimensions. Think deeply about each item.

### A. Requirements Coverage

- [ ] Does the change address what the JIRA issue asked for?
- [ ] Are there gaps — things the issue requested that aren't in the diff?
- [ ] Are there scope creep additions not covered by the issue?

### B. Technical Correctness

Use the investigator's verification report to inform these checks:

- [ ] Code examples use correct syntax and are logically coherent
- [ ] API signatures, parameters, and return types match the actual source
- [ ] Class names, method names, and file paths are accurate
- [ ] Configuration values and settings are valid
- [ ] No deprecated features or APIs recommended
- [ ] Prerequisites and system requirements are up-to-date
- [ ] Version-specific information is correctly noted

### C. Style Guide Compliance

Review against the style guides you read in Phase 2:

**Writing standards (docs-style-guide-full.md):**

**Typography (typography.md):**

**Terminology (word-list.md):**

**Interaction verbs (docs-style-guide-full.md):**

**Markdown & Jekyll syntax (markdown-syntax.md):**
- [ ] Correct frontmatter fields and format
- [ ] Proper use of callouts, includes, and Liquid tags
- [ ] Links use correct Jekyll/relative format

If unsure whether a term, pattern, or convention is correct for the Kentico docs, cross-reference other documentation files in the repo using search. Existing usage by experienced writers is a valid reference point.

### D. Content Quality

- [ ] Steps are logical and complete — a user following them reaches the stated outcome
- [ ] Result section describes expected outcomes
- [ ] Next Steps provide relevant follow-up actions (if appropriate)
- [ ] Tables and lists improve readability where used
- [ ] Code examples are complete and sensible within context
- [ ] No contradictions or inconsistencies within the document or with related docs
- [ ] Content is scannable — proper use of headings, bold, lists to break up walls of text
- [ ] Links are valid and point to correct locations (check against existing files)

### Pre-verdict audit

Before moving to delivery, audit your own findings:

1. Every `STY-XXX` finding must cite a specific rule from one of the five style guides (document name + section). If you can't point to the rule, drop the finding.
2. Every `ACC-XXX` finding must trace to the investigator's report or your own verified source URL. If the investigator flagged it and you didn't corroborate, drop it.
3. Re-check the JIRA issue scope — are any `REQ-XXX` gaps actually out-of-scope for the issue?

## Before moving to Phase 6

Update `state.md`:
- Set "Current Phase" to `Phase 6: Deliver`
- Set "Skills for this phase" to:
  - malph-workflow-deliver
- Add Phase 5 to "Completed Phases"
- Record your verdict (APPROVED or NEEDS REVISION) and all findings under "Review Findings" — use issue codes (`STY-XXX`, `ACC-XXX`, `REQ-XXX`, `SUG-XXX`)
