{%- unless isRevision %}

# Phase 6: Review

## Before you begin

1. **Read `state.md`** — confirm you're in Phase 6.
2. All tests (unit + E2E) must pass before review.

## Instructions

1. **Prepare a change summary** — list all files modified/created with a one-line description of each change:
   ```
   git diff --stat main
   ```

2. **Delegate to stacky-reviewer sub-agent** — provide:
   - The git diff of your changes
   - The JIRA issue description and acceptance criteria
   - Which domain skills are relevant (so the reviewer knows the tech stack)
   
   The reviewer checks for:
   - Code quality and consistency with existing patterns
   - Proper error handling
   - Missing edge cases
   - Performance concerns
   - Adherence to conventions in each tech stack (Ruby, JS, CSS, Jekyll)

3. **Delegate to stacky-bug-auditor sub-agent** — provide:
   - The git diff of your changes
   - The affected integration points (cross-component interactions)
   
   The bug auditor checks for:
   - Regressions in existing behavior
   - Breaking changes to public APIs (tag parameters, frontmatter fields)
   - Missing null checks or boundary conditions
   - Backwards compatibility issues
   - Build pipeline impact

4. **Address all findings by re-dispatching `stacky-coder`** — the orchestrator does not implement fixes directly. Re-run the relevant QA sub-agents after the coder returns.

5. **Final verification check:** confirm the latest coder/test/E2E/review artifacts show a clean result before committing.

## Before moving to Phase 7

Update `state.md`:
- Set "Current Phase" to `Phase 7: Commit`
- Set "Reference file for this phase" to `references/7-commit.md`
- Add Phase 6 to "Completed Phases" with review findings addressed

{%- else %}
<!-- This file is for the standard workflow. You are running a revision workflow — this file is intentionally empty. -->
{%- endunless %}
