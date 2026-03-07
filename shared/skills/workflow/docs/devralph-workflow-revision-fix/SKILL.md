---
name: devralph-workflow-revision-fix
description: "Phase 2 of the revision workflow — dispatch stacky-coder to implement the fix plan, then run the existing test and review subagents before committing."
---
{% raw %}

# Revision Phase 2: Fix

## Before you begin

1. **Read `state.md`** — confirm you're in Revision Phase 2. Review the Fix Plan.
2. Read domain skills for the affected components.

## Instructions

1. **Dispatch `stacky-coder`** with the Fix Plan from `state.md`.
2. Validate the coder result — confirm the fixes were implemented and the build is green before moving into the verification gauntlet.

## Verification (mandatory before commit)

After all fixes are implemented and building cleanly, run the full verification gauntlet:

4. **Delegate to stacky-test-writer** — write or update unit/integration tests covering every defect that was fixed. Missing test coverage is often why defects slip through in the first place.

5. **Delegate to stacky-e2e-playwright** — if any fix touches UI-visible behavior, write or update Playwright E2E tests to prevent regression.

6. **Delegate to stacky-reviewer** — review the full diff for code quality, convention adherence, and correctness.

7. **Delegate to stacky-bug-auditor** — analyze all changes for regressions, breaking changes, and edge cases. This is especially critical in revisions where a fix in one area can break another.

If any sub-agent flags issues, fix them before proceeding.

## Before moving to Revision Phase 3

Update `state.md`:
- Set "Current Phase" to `Revision Phase 3: Commit`
- Set "Skills for this phase" to:
  - devralph-workflow-revision-commit
- Add Revision Phase 2 to "Completed Phases" with summary of fixes
- Confirm all builds and tests pass

{% endraw %}
