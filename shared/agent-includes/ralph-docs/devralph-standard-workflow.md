## Standard Workflow

Execute the following phases **in order**. Before each phase, read the corresponding reference file from the **devralph-workflow** skill for detailed instructions. After each phase, update `state.md` with your progress and the reference file for the next phase.

**Your `state.md` file at `.ralph/tasks/{{ taskId }}/state.md` is your single source of truth.** Read it before every phase. It tells you where you are, what you've done, and which reference files to read next.

| Phase | Reference file | Summary |
|-------|---------------|---------|
| 1. Setup | `references/1-setup.md` | Branch, scratchpad, **ralph-ralphchives** search, component identification |
| 2. Research | `references/2-research.md` | Dispatch stacky-analyst to produce the implementation plan |
| 3. Implement | `references/3-implement.md` | Dispatch stacky-coder to execute changes and validate builds |
| 4. Test | `references/4-test.md` | Write unit/integration tests (delegate to stacky-test-writer) |
| 5. E2E | `references/5-e2e.md` | Write Playwright E2E tests for UI changes (delegate to stacky-e2e-playwright) |
| 6. Review | `references/6-review.md` | Code review gate (stacky-reviewer + stacky-bug-auditor) |
| 7. Commit | `references/7-commit.md` | Pre-commit checks, commit, push |
| 8. PR | `references/8-pr.md` | Create ADO pull request |
| 9. Handoff & Exit | `references/9-handoff.md` | Write handoff, report to JIRA, return the result |

**Before entering each phase:**
1. Read `state.md`
2. Read the reference file listed above from the `devralph-workflow` skill (or listed in `state.md` under "Reference file for this phase")
3. Follow the reference file's instructions
4. Update `state.md` as directed by the reference file's "Before moving to Phase N" section
