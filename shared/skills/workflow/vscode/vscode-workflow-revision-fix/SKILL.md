---
name: vscode-workflow-revision-fix
description: "VS Code extension revision workflow Phase 2. Read this skill after understanding the feedback. Covers implementing the requested fixes, optionally delegating to the analyst, and validating with build/lint/test."
---

# Revision Phase 2: Implement Fixes

## Before you begin

1. **Read `state.md`** at `.ralph/tasks/{{ taskId }}/state.md`
2. **Verify the current phase** — this skill is for Revision Phase 2. If `state.md` shows a different current phase, update it now.
3. **Review the feedback summary** from Revision Phase 1.

## Instructions

1. Work through each feedback item from the reviewer
2. Optionally **delegate analysis to `ralph-analyst`** if the feedback requires understanding unfamiliar parts of the codebase
3. Make the requested changes — fix specific issues raised, do NOT restart from scratch
4. Validate after changes:

```bash
npm run build
npm run lint
npm run test:xvfb
```

- If tests fail, diagnose and fix
- If display-related test errors persist after multiple attempts, proceed with build + lint passing

## Before moving to Revision Phase 3

Update `state.md`:
- Set "Current Phase" to `Revision Phase 3: Commit & Respond`
- Set "Skills for this phase" to:
  - vscode-workflow-revision-commit
- Add Revision Phase 2 to "Completed Phases" with build/lint/test results
