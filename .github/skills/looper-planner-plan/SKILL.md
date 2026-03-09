---
name: looper-planner-plan
description: "Looper Planner Phase 4. Write the implementation plan converting spec WHAT into technical HOW, present for review, iterate until approved. Use when state.md shows Phase 4: Plan."
---

# Phase 4: Implementation Plan

## Before you begin

1. Read `state.md` — verify this is Phase 4
2. Read the approved `01.specification.md`
3. Review Phase 1 context (project structure, patterns, conventions)

## Instructions

### 1. Write the plan

Create `02.plan.md` in the working directory:

```markdown
# Implementation Plan: [Feature/Change Name]

## Overview
[Brief summary of the technical approach]

## Architecture Changes
[Describe any architectural changes, new modules, or refactoring needed]

## Implementation Steps
### Step 1: [Component/Module Name]
**Files to modify/create**:
- `path/to/file1.py` - [what changes]
- `path/to/file2.py` - [what changes]

**Technical approach**:
[2-3 sentences on how this will be implemented]

**Dependencies**: [List any steps this depends on]

### Step 2: [Next Component]
...

## Testing Strategy
- **Unit tests**: [what needs unit testing]
- **Integration tests**: [what needs integration testing]
- **Manual testing**: [what needs manual verification]

## Risks and Mitigations
- **Risk 1**: [description] → **Mitigation**: [approach]

## Rollout Considerations
- [Deployment considerations]
- [Backward compatibility notes]
- [Feature flags or gradual rollout needs]
```

**Key principles:**
- Convert specification WHAT into technical HOW
- Be specific about files, modules, and technical approach
- Reference actual paths and patterns found in Phase 1
- Be more technical than the specification
- Each step should be independently estimable

### 2. Present for review

**MANDATORY: Present the plan to the user and pause for review.**

If the user requests changes:
- Stay in this phase
- Iterate on the plan
- Do NOT proceed until the user approves

## Before moving to Phase 5

Update `state.md`:
- Set "Current Phase" to `Phase 5: Task Breakdown`
- Set "Skills for this phase" to:
  - looper-planner-tasks
- Add Phase 4 to "Completed Phases" noting approval
