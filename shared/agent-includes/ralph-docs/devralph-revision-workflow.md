## Revision Workflow

This is a **revision** — you're fixing defects found in a previous implementation for **{{ taskId }}**.

Execute the following phases **in order**:

| Phase | Skill | Summary |
|-------|-------|---------|
| 1. Setup | **devralph-workflow-revision-setup** | Review previous handoff, understand feedback, run **ralph-ralphchives** search, plan fixes |
| 2. Fix & Verify | **devralph-workflow-revision-fix** | Dispatch stacky-coder for fixes, then run test and review subagents |
| 3. Commit | **devralph-workflow-revision-commit** | Commit fixes, push to update PR |
| 4. Handoff & Exit | **devralph-workflow-revision-handoff** | Update handoff, report to JIRA, print exit block |

**Before entering each phase:**
1. Read `state.md`
2. Read the phase's skill file listed above
3. Follow the skill's instructions
4. Update `state.md` as directed
