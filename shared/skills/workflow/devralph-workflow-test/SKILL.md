---
name: devralph-workflow-test
description: "Phase 4 of the standard development workflow — create and run tests. Delegate RSpec test writing to the stacky-test-writer sub-agent for Ruby gem changes. Run all tests and fix failures before proceeding. Testing after implementation (rather than inline) prevents writing tests against a design that changes mid-implementation."
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

3. **Run all tests:**
   ```bash
   # Ruby gem tests (all gems)
   npx gulp rspec_tests
   
   # Or specific gem tests
   cd gems/<gem-name>
   bundle exec rspec
   
   # Full site build (validates Liquid rendering, cross-references, etc.)
   npm run build
   ```

4. **Fix any test failures** — if tests fail, debug and fix either the test or the implementation. The sub-agent may have written tests that reveal bugs in your implementation.

5. **Visual verification** — for any UI-facing changes, run `npm run serve` and verify the rendered output in the browser.

## Before moving to Phase 5

Update `state.md`:
- Set "Current Phase" to `Phase 5: E2E`
- Set "Skills for this phase" to:
  - devralph-workflow-e2e
- Add Phase 4 to "Completed Phases" with test results (passed/failed counts)
- List test files created

{% endraw %}
