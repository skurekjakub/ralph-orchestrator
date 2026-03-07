## Review Workflow

Execute the following phases **in order**. Before each phase, read the corresponding skill file for detailed instructions. After each phase, update `state.md` with your progress and the skills needed for the next phase.

**Your `state.md` file at `.ralph/tasks/{{ taskId }}/state.md` is your single source of truth.** Read it before every phase. It tells you where you are, what you've done, and which skills to read next.

| Phase | Skill | Summary |
|-------|-------|---------|
| 1. Setup | malph-vscode-workflow-setup | Read issue, find PR, create artifacts dir, JIRA greeting |
| 2. Scout | malph-vscode-workflow-scout | Dispatch malph-scout for diff mapping + build validation |
| 3. Review Panel | malph-vscode-workflow-review-panel | Dispatch 3 independent reviewers sequentially |
| 4. Aggregate & Deliver | malph-vscode-workflow-aggregate | Aggregate verdicts, post unified JIRA comment |
| 5. Handoff | malph-vscode-workflow-handoff | Write review handoff, attach to JIRA |
| 6. Archive & Exit | malph-vscode-workflow-archive | Dispatch ralph-scribe, print exit block |

**Before entering each phase:**
1. Read `state.md`
2. Read the phase's skill file listed above (or listed in `state.md` under "Skills for this phase")
3. Follow the skill's instructions
4. Update `state.md` as directed by the skill's "Before moving to the next phase" section
