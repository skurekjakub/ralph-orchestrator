---
name: vscode-workflow-execute
description: "VS Code extension workflow Phase 2. Read this skill after setup is complete. Covers implementing changes in TypeScript, running build/lint/test validation, and iterating until all checks pass. This is the core implementation phase."
---

# Phase 2: Execute Changes

## Before you begin

1. **Read `state.md`** at `.ralph/tasks/{{ taskId }}/state.md`
2. **Verify the current phase** — this skill is for Phase 2. If `state.md` shows a different current phase, update it now.
3. **Review completed phases** — confirm Phase 1 (Setup) is done and the analyst's report is recorded.

## Instructions

### Implement Changes

Work directly on the codebase using the analyst's implementation path as a guide. This is a VS Code extension project:

- TypeScript source in `src/`
- Grammar definitions in `grammars/`
- Extension manifest in `package.json`
- Tests via VS Code test framework (Mocha TDD)
- All public methods must have proper JSDoc documentation

Follow the patterns established in `.github/copilot-instructions.md` — particularly the definition-driven architecture.

### Build Validation

**ONLY use `npm run build` to validate your changes.** Do NOT try to analyze the build system, look at webpack configs, or run any other build command. If `npm run build` fails, fix the code until it passes.

### Full Validation

After implementing all changes, run the full validation:

```bash
npm run build
npm run lint
npm run test:xvfb
```

**Testing notes:**
- Always use `npm run test:xvfb` — never `npm test` directly (requires Xvfb for headless VS Code instance)
- If tests fail, diagnose and fix the issue
- If display-related test errors persist after multiple attempts, proceed with build + lint passing

Fix any errors before proceeding.

## Before moving to Phase 3

Update `state.md`:
- Set "Current Phase" to `Phase 3: Commit`
- Set "Skills for this phase" to:
  - vscode-workflow-commit
- Keep the reminder line: `> ⚠️ STOP — Read every skill listed above BEFORE doing any work in this phase.`
- Add Phase 2 to "Completed Phases" with build/lint/test results
- Record key changes made in "Key Decisions"
