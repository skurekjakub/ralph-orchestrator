---
name: malph-vscode-workflow-verify
description: "VS Code extension review workflow Phase 4. Read this skill after investigating. Covers build, lint, and test validation. Any failure is an automatic blocker."
---

# Phase 4: Build & Test Validation

## Before you begin

1. **Read `state.md`** at `.ralph/tasks/{{ taskId }}/state.md`
2. **Verify the current phase** — this skill is for Phase 4.

## Instructions

If the investigator already ran build/lint, you may use those results. Otherwise (or if you want to verify), run:

```bash
npm run compile
npm run lint:ci
npm run test:xvfb
```

Record results in `state.md`. If any command fails, that's an automatic blocker — note the exact error output.

**Key validations:**
- `npm run compile` — TypeScript compilation via webpack
- `npm run lint:ci` — ESLint with `--max-warnings 0` (CI is zero-tolerance on warnings)
- `npm run test:xvfb` — Headless test run in a real VS Code instance

## Before moving to Phase 5

Update `state.md`:
- Set "Current Phase" to `Phase 5: Review`
- Set "Skills for this phase" to:
  - malph-vscode-workflow-review
- Add Phase 4 to "Completed Phases" with build/lint/test results
- Record any build failures as findings
