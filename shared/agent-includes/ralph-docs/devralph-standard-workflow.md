## Standard Workflow

Execute the following phases **in order**. Before each phase, read the corresponding skill file for detailed instructions. After each phase, update `state.md` with your progress and the skills needed for the next phase.

**Your `state.md` file at `.ralph/tasks/{{ taskId }}/state.md` is your single source of truth.** Read it before every phase. It tells you where you are, what you've done, and which skills to read next.

| Phase | Skill | Summary |
|-------|-------|---------|
| 1. Setup | **devralph-workflow-setup** | Branch, scratchpad, **ralph-ralphchives** search, component identification |
| 2. Research | **devralph-workflow-research** | Dispatch stacky-analyst to produce the implementation plan |
| 3. Implement | **devralph-workflow-implement** | Dispatch stacky-coder to execute changes and validate builds |
| 4. Test | **devralph-workflow-test** | Write unit/integration tests (delegate to stacky-test-writer) |
| 5. E2E | **devralph-workflow-e2e** | Write Playwright E2E tests for UI changes (delegate to stacky-e2e-playwright) |
| 6. Review | **devralph-workflow-review** | Code review gate (stacky-reviewer + stacky-bug-auditor) |
| 7. Commit | **devralph-workflow-commit** | Pre-commit checks, commit, push |
| 8. PR | **devralph-workflow-pr** | Create ADO pull request |
| 9. Handoff & Exit | **devralph-workflow-handoff** | Write handoff, report to JIRA, print exit block |

**Before entering each phase:**
1. Read `state.md`
2. Read the phase's skill file listed above (or listed in `state.md` under "Skills for this phase")
3. Follow the skill's instructions
4. Update `state.md` as directed by the skill's "Before moving to Phase N" section
