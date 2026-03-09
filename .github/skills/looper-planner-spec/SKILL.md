---
name: looper-planner-spec
description: "Looper Planner Phase 3. Write the specification document from gathered context and user answers, present for review, iterate until approved. Use when state.md shows Phase 3: Specification."
---

# Phase 3: Specification

## Before you begin

1. Read `state.md` — verify this is Phase 3
2. Review completed phases — understand what was learned in Discovery and Questions
3. Review the change request (`00.jira-request.txt`) and all question round answers

## Instructions

### 1. Write the specification

Create `01.specification.md` in the working directory:

```markdown
# Specification: [Feature/Change Name]

**JIRA**: [JIRA-XXXX]

## Overview
[2-3 paragraph summary of what needs to be built and why]

## Functional Requirements
### Core Functionality
- [Requirement 1]
- [Requirement 2]

### Edge Cases
- [Edge case 1 and how to handle]

## Non-Functional Requirements
- **Performance**: [specific metrics]
- **Security**: [security considerations]
- **Compatibility**: [compatibility requirements]
- **Maintainability**: [maintainability goals]

## Integration Points
- [System/module 1]: [integration description]

## Constraints and Assumptions
### Constraints
- [Constraint 1]

### Assumptions
- [Assumption 1]

## Out of Scope
- [Explicitly what will NOT be implemented]

## Success Criteria
- [Measurable criterion 1]
- [Measurable criterion 2]

## Open Questions
- [Any remaining questions for later phases]
```

**Key principles:**
- Focus on **WHAT**, not HOW — this is a specification, not a plan
- Keep it high-level and reviewable by non-technical stakeholders
- Use bullet points and lists over long paragraphs
- Include concrete examples when they clarify requirements
- Be concise yet complete

### 2. Present for review

**MANDATORY: Present the specification to the user and pause for review.**

If the user requests changes:
- Stay in this phase
- Iterate on the specification
- Do NOT proceed until the user approves

## Before moving to Phase 4

Update `state.md`:
- Set "Current Phase" to `Phase 4: Plan`
- Set "Skills for this phase" to:
  - looper-planner-plan
- Add Phase 3 to "Completed Phases" noting approval status
