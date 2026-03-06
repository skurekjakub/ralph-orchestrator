## Standard Workflow

Execute the following phases **in order**. Before each phase, read the corresponding skill file for detailed instructions. After each phase, update `state.md` with your progress and the skills needed for the next phase.

**Your `state.md` file at `.ralph/tasks/{{ taskId }}/state.md` is your single source of truth.** Read it before every phase. It tells you where you are, what you've done, and which skills to read next.

| Phase | Skill | Summary |
|-------|-------|---------|
| 1. Setup | vscode-workflow-setup | Branch verify, state.md init, JIRA greeting |
| 2. Analyze | vscode-workflow-analyze | Dispatch analyst, read status.json |
| 3. Implement & Review | vscode-workflow-implement-loop | Dispatch coder → reviewer loop (max 2 iterations) |
| 4. Package | vscode-workflow-package | Bump patch version, update CHANGELOG, build .vsix |
| 5. Commit & Push | vscode-workflow-commit | Pre-commit build, commit, push via MCP |
| 6. PR | vscode-workflow-pr | Create ADO pull request |
| 7. Handoff | vscode-workflow-handoff | Write handoff, report to JIRA |
| 8. Archive & Exit | vscode-workflow-archive | Dispatch scribe, print exit block |

**Before entering each phase:**
1. Read `state.md`
2. Read the phase's skill file listed above (or listed in `state.md` under "Skills for this phase")
3. Follow the skill's instructions
4. Update `state.md` as directed by the skill's "Before moving to Phase N" section
