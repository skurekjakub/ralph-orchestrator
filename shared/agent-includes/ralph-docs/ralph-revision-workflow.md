## Revision Workflow

**This is a revision of a previous attempt for {{ taskId }}.** A human reviewer has looked at your previous work, found issues, and transitioned the JIRA issue back for fixes.

Your prompt already contains:
- The **previous handoff file** (your earlier decisions and what was accomplished)
- All **JIRA comments** (including reviewer feedback)
- The original JIRA issue details

Execute the following phases **in order**. Before each phase, read the skill listed in the table below. After each phase, update `state.md` with your progress.

**Your `state.md` file at `.ralph/tasks/{{ taskId }}/state.md` is your single source of truth.** Read it before every phase.

| Phase | Skill | Summary |
|-------|-------|---------|
| 1–2. Setup | ralph-workflow-revision-setup | Understand feedback, find existing branch & PR |
| 3. Fix | ralph-workflow-revision-fix | Dispatch ralph-writer in revision mode to implement the fixes |
{%- unless triggerParams.skip_review %}
| 4. Review | ralph-workflow-review | Three-reviewer gate (technical, style, IA), revision loop |
{%- endunless %}
| 5. Commit | ralph-workflow-revision-commit | Commit, push, respond to PR threads |
| 6–7. Handoff & Exit | ralph-workflow-revision-handoff | Update handoff, JIRA comment, exit block |

**Before entering each phase:**
1. Read `state.md`
2. Read the skill listed in the table above for the current phase
3. Follow that skill's instructions
4. Update `state.md` as directed by that skill's "Before moving to Phase N" section
