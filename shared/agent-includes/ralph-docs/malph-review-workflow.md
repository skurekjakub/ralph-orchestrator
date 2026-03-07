## Review Workflow

Execute the following phases **in order**. Before each phase, read the corresponding skill file for detailed instructions. After each phase, update `state.md` with your progress and the skills needed for the next phase.

**Your `state.md` file at `.ralph/tasks/{{ taskId }}/state.md` is your single source of truth.** Read it before every phase. It tells you where you are, what you've done, and which skills to read next.

| Phase | Skill | Summary |
|-------|-------|---------|
| 1. Descend | malph-workflow-descend | Read issue, download handoff, search ralphchives, find PR |
| 2. Study the Law | malph-workflow-study | Read all reference files cover to cover |
| 3. Investigate | malph-workflow-investigate | Dispatch malph-scout for diff map, requirement coverage, and build status |
| 4. Verify | malph-workflow-verify | Dispatch the technical reviewer and preserve accuracy findings |
| 5. Review | malph-workflow-review | Dispatch style + IA reviewers, then aggregate the panel verdict |
| 6. Deliver | malph-workflow-deliver | Post JIRA comment + ADO PR threads |
| 7. Handoff & Exit | malph-workflow-handoff | Write review handoff, report to ralphchives, print exit block |

**Before entering each phase:**
1. Read `state.md`
2. Read the phase's skill file listed above (or listed in `state.md` under "Skills for this phase")
3. Follow the skill's instructions
4. Update `state.md` as directed by the skill's "Before moving to Phase N" section
