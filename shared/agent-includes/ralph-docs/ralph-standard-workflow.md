## Standard Workflow

Execute the following phases **in order**. Before each phase, read the corresponding skill file for detailed instructions. After each phase, update `state.md` with your progress and the skills needed for the next phase.

**Your `state.md` file at `.ralph/tasks/{{ taskId }}/state.md` is your single source of truth.** Read it before every phase. It tells you where you are, what you've done, and which skills to read next.

| Phase | Skill | Summary |
|-------|-------|---------|
| 1. Setup | ralph-workflow-setup | Branch, scratchpad, ralphchives search |
| 2. Research | ralph-workflow-research | Delegate to ralph-researcher sub-agent |
| 3. Write | ralph-workflow-write | Implement documentation changes |
{%- unless triggerParams.skip_review %}
| 4–5. Review | ralph-workflow-review | Delegate to ralph-reviewer, revision loop |
{%- endunless %}
| 6. Commit | ralph-workflow-commit | Pre-commit checks, commit, push |
| 7. PR | ralph-workflow-pr | Create ADO pull request |
| 8. Handoff & Exit | ralph-workflow-handoff | Write handoff, report to JIRA, print exit block |

**Before entering each phase:**
1. Read `state.md`
2. Read the phase's skill file listed above (or listed in `state.md` under "Skills for this phase")
3. Follow the skill's instructions
4. Update `state.md` as directed by the skill's "Before moving to Phase N" section
