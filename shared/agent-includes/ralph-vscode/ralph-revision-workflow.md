## Revision Workflow

Execute the following phases **in order**. Before each phase, read the corresponding skill file for detailed instructions. After each phase, update `state.md` with your progress and the skills needed for the next phase.

**Your `state.md` file at `.ralph/tasks/{{ taskId }}/state.md` is your single source of truth.** Read it before every phase. It tells you where you are, what you've done, and which skills to read next.

| Phase | Skill | Summary |
|-------|-------|---------|
| 1. Understand | vscode-workflow-revision-setup | Read feedback, find existing PR & branch |
| 2. Analyze Revision | vscode-workflow-analyze | Dispatch analyst in revision mode, read status.json |
| 3. Fix & Review | vscode-workflow-implement-loop | Dispatch coder → reviewer loop (max 2 iterations) |
| 4. Package | vscode-workflow-package | Bump patch version, update CHANGELOG, build .vsix |
| 5. Commit & Respond | vscode-workflow-revision-commit | Commit, push, reply to PR threads |
| 6. Handoff | vscode-workflow-revision-handoff | Update handoff, report to JIRA |
| 7. Archive & Exit | vscode-workflow-archive | Dispatch scribe, print exit block |

**Before entering each phase:**
1. Read `state.md`
2. Read the phase's skill file listed above (or listed in `state.md` under "Skills for this phase")
3. Follow the skill's instructions
4. Update `state.md` as directed by the skill's "Before moving to Phase N" section
