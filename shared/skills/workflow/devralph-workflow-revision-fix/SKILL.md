---
name: devralph-workflow-revision-fix
description: "Phase 2 of the revision workflow — implement fixes for each defect in your fix plan. Address issues one at a time, building and testing after each fix. Fixing incrementally prevents one fix from masking or introducing another problem."
---
{% raw %}

# Revision Phase 2: Fix

## Before you begin

1. **Read `state.md`** — confirm you're in Revision Phase 2. Review the Fix Plan.
2. Read domain skills for the affected components.

## Instructions

1. **Work through the Fix Plan** from `state.md` item by item. Use the todo tool to track progress.

2. **For each defect:**
   a. Read the relevant code and understand the issue
   b. Implement the fix
   c. Run the build: `npm run build`
   d. Run relevant tests: `npx gulp rspec_tests` for Ruby changes
   e. If the fix involved UI changes, verify with `npm run serve`

3. **Update or add tests** where the defect reveals a missing test case.

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
