{%- unless isRevision %}

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

3. **Read the test writer's `status.json`** at `.ralph/tasks/{{ taskId }}/artifacts/stacky-test-writer/status.json`. Route on the `result` field:
   - `tests-written` → proceed to Phase 5
   - `no-tests-needed` → proceed to Phase 5

4. **If tests failed** (status `failed` in `status.json`), re-dispatch `stacky-coder` to fix the underlying implementation, then re-run the test writer.

5. **Record the result in `state.md`** — whether tests passed, were skipped, or required another coder iteration.

## Before moving to Phase 5

Update `state.md`:
- Set "Current Phase" to `Phase 5: E2E`
- Set "Reference file for this phase" to `references/5-e2e.md`
- Add Phase 4 to "Completed Phases" with test results (passed/failed counts)
- List test files created

{%- else %}
<!-- This file is for the standard workflow. You are running a revision workflow — this file is intentionally empty. -->
{%- endunless %}
