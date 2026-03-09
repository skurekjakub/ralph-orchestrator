## Standard Workflow

Execute the following phases **in order**. Before each phase, read the skill listed in the table below. After each phase, update `state.md` with your progress.

**Your `state.md` file at `.ralph/tasks/{{ taskId }}/state.md` is your single source of truth.** Read it before every phase.

| Phase | Skill | Summary |
|-------|-------|---------|
| 1. Setup | ralph-workflow-setup | Branch, scratchpad, ralphchives search |
{%- if triggerParams.codesamples and triggerParams.xpversion %}
| 1b. Coder | ralph-codesamples-bootstrap | Dispatch ralph-coder to bootstrap the codesamples .NET project |
{%- endif %}
| 2. Research | ralph-workflow-research | Dispatch ralph-researcher to produce the research report |
| 3. Write | ralph-workflow-write | Dispatch ralph-writer to implement changes and use ralph-validator |
{%- unless triggerParams.skip_review %}
| 4–5. Review | ralph-workflow-review | Three-reviewer gate (technical, style, IA), revision loop |
{%- endunless %}
| 6. Commit | ralph-workflow-commit | Pre-commit checks, commit, push |
| 7. PR | ralph-workflow-pr | Create ADO pull request |
| 8. Handoff & Exit | ralph-workflow-handoff | Dispatch ralph-scribe, deliver to JIRA, print exit block |

**Before entering each phase:**
1. Read `state.md`
2. Read the skill listed in the table above for the current phase
3. Follow that skill's instructions
4. Update `state.md` as directed by that skill's "Before moving to Phase N" section
