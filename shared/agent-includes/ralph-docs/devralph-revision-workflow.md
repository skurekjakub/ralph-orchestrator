## Revision Workflow

This is a **revision** — you're fixing defects found in a previous implementation for **{{ taskId }}**.

Execute the following phases **in order**:

| Phase | Reference file | Summary |
|-------|---------------|---------|
| 1. Setup | `references/r1-setup.md` | Review previous handoff, understand feedback, run **ralph-ralphchives** search, plan fixes |
| 2. Fix & Verify | `references/r2-fix.md` | Dispatch stacky-coder for fixes, then run test and review subagents |
| 3. Commit | `references/r3-commit.md` | Commit fixes, push to update PR |
| 4. Handoff & Exit | `references/r4-handoff.md` | Update handoff, report to JIRA, return the result |

**Before entering each phase:**
1. Read `state.md`
2. Read the reference file listed above from the `devralph-workflow` skill
3. Follow the reference file's instructions
4. Update `state.md` as directed
