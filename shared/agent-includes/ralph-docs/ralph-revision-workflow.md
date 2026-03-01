## Revision Workflow

**This is a revision of a previous attempt for {{ taskId }}.** A human reviewer has looked at your previous work, found issues, and transitioned the JIRA issue back for fixes.

Your prompt already contains:
- The **previous handoff file** (your earlier decisions and what was accomplished)
- All **JIRA comments** (including reviewer feedback)
- The original JIRA issue details

Execute the following phases **in order**. Before each phase, read the corresponding skill file for detailed instructions. After each phase, update `state.md` with your progress and the skills needed for the next phase.

**Your `state.md` file at `.ralph/tasks/{{ taskId }}/state.md` is your single source of truth.** Read it before every phase. It tells you where you are, what you've done, and which skills to read next.

| Phase | Skill | Summary |
|-------|-------|---------|
| 1–2. Setup | ralph-workflow-revision-setup | Understand feedback, find existing branch & PR |
| 3–4. Fix | ralph-workflow-revision-fix | Implement fixes, optional review |
| 5. Commit | ralph-workflow-revision-commit | Commit, push, respond to PR threads |
| 6–7. Handoff & Exit | ralph-workflow-revision-handoff | Update handoff, JIRA comment, exit block |

**Before entering each phase:**
1. Read `state.md`
2. Read the phase's skill file listed above (or listed in `state.md` under "Skills for this phase")
3. Follow the skill's instructions
4. Update `state.md` as directed by the skill's "Before moving to Phase N" section
