---
name: devralph-workflow-test
description: "Phase 4 of the standard development workflow — dispatch the stacky-test-writer sub-agent for unit/integration test creation and execution, then record the result for the next phase."
---
{% raw %}

# Phase 4: Test

## Before you begin

1. **Read `state.md`** — confirm you're in Phase 4. Review the files changed in Phase 3.
2. The build must pass before entering this phase.

## Instructions

1. **Determine test types needed** based on what you changed:

   | Changed area | Test type | Framework | Location |
   |-------------|-----------|-----------|----------|
   | Ruby gem code | Unit tests | RSpec | `gems/<gem>/spec/` |
   | Liquid tags | Tag rendering tests | RSpec | `gems/liquid-kfm/spec/` or `gems/<gem>/spec/` |
   | Jekyll generators/hooks | Integration tests | RSpec | `gems/<gem>/spec/` |
   | Frontend JS | Manual verification | BrowserSync | `npm run serve` |
   | Gulp tasks | Task execution | Manual | Run the specific gulp task |
   | Layouts/includes | Visual verification | BrowserSync | `npm run serve` |

2. **Delegate test writing to stacky-test-writer sub-agent** — provide it with:
   - The files you changed (paths and descriptions)
   - The existing test files in the relevant `spec/` directory (so it matches conventions)
   - The expected behavior your changes implement

3. **Validate the sub-agent result** — confirm the test writer returned:
   - Test files created or updated
   - Pass/fail status for the tests it ran
   - Any failures that require a new coder iteration

4. **If tests failed, re-dispatch `stacky-coder`** to fix the underlying implementation or adjust the test where warranted, then re-run the test writer.

5. **Record the result in `state.md`** — whether tests passed, were skipped, or required another coder iteration.

## Before moving to Phase 5

Update `state.md`:
- Set "Current Phase" to `Phase 5: E2E`
- Set "Skills for this phase" to:
  - devralph-workflow-e2e
- Add Phase 4 to "Completed Phases" with test results (passed/failed counts)
- List test files created

{% endraw %}
