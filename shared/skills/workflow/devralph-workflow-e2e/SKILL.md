---
name: devralph-workflow-e2e
description: "Phase 5 of the standard development workflow — write Playwright E2E tests for UI-facing changes. Delegate to the stacky-e2e-playwright sub-agent. Skip if changes are purely backend (gem logic, Gulp pipeline, config) with no rendered HTML or JS behavior changes. E2E tests catch broken user flows that unit tests miss — a tag might render valid HTML that still breaks the page layout or search."
---
{% raw %}

# Phase 5: E2E Testing

## Before you begin

1. **Read `state.md`** — confirm you're in Phase 5.
2. All unit tests must pass before entering this phase.

## Gate: Is E2E testing needed?

Skip this phase (mark as "Skipped — no UI impact" in `state.md`) if your changes:
- Are purely backend Ruby gem logic with no rendered HTML changes
- Only modify the Gulp pipeline without changing build output
- Are config-only changes

Proceed if your changes affect:
- Rendered HTML output (layouts, includes, Liquid tags)
- Frontend JS behavior (search, navigation, version switcher, etc.)
- CSS styling (visual appearance)
- Learn Portal UI (module navigation, progress tracking)

## Instructions

1. **Start the dev server** — `npm run serve` (runs BrowserSync at `http://localhost:3000`)

2. **Delegate E2E test writing to stacky-e2e-playwright sub-agent** — provide it with:
   - What changed and how it should behave in the browser
   - The URL paths to test (e.g., `/documentation/page-name`, `/documentation/search`)
   - Expected visual/functional outcomes
   - The dev server URL (`http://localhost:3000`)

3. **Review and run the E2E tests** written by the sub-agent.

4. **Fix any E2E test failures** — either adjust the tests or fix the implementation.

## Before moving to Phase 6

Update `state.md`:
- Set "Current Phase" to `Phase 6: Review`
- Set "Skills for this phase" to:
  - devralph-workflow-review
- Add Phase 5 to "Completed Phases" with E2E test results or "Skipped"

{% endraw %}
