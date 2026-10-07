## Revision Workflow

**This is a revision of a previous attempt for {{ taskId }}.** A human reviewer has looked at your previous work, found issues, and transitioned the JIRA issue back for fixes.

Your prompt already contains:
- The **previous handoff file** (your earlier decisions and what was accomplished)
- All **JIRA comments** (including reviewer feedback)
- The original JIRA issue details

Execute the following phases **in order**. Before each phase, read the **ralph-workflow** skill — it routes you to the correct reference file. After each phase, update `state.md` with your progress.

**Your `state.md` file at `.ralph/tasks/{{ taskId }}/state.md` is your single source of truth.** Read it before every phase.

| Phase | Reference | Summary |
|-------|-----------|---------|
| 1–2. Setup | `references/r1-setup.md` | Understand feedback, find existing branch & PR |
| 3. Fix | `references/r3-fix.md` | Dispatch ralph-planner, then ralph-writer for the next pending fix task |
| 4. Review | `references/4-review.md` | Review the current task, revise it if needed, then advance to the next task |
| 5. Commit | `references/r5-commit.md` | Commit, push, respond to PR threads |
| 6. Handoff & Exit | `references/r6-handoff.md` | Dispatch ralph-scribe, deliver revision handoff, return the result |

**Before entering each phase:**
1. Read `state.md`
2. Read the **ralph-workflow** skill to find the reference file for your current phase
3. Read the reference file and follow its instructions
4. Update `state.md` as directed by the reference file's "Before moving to Phase N" section
