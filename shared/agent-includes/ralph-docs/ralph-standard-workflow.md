## Standard Workflow

Execute the following phases **in order**. Before each phase, read the **ralph-workflow** skill — it routes you to the correct reference file. After each phase, update `state.md` with your progress.

**Your `state.md` file at `.ralph/tasks/{{ taskId }}/state.md` is your single source of truth.** Read it before every phase.

| Phase | Reference | Summary |
|-------|-----------|---------|
| 1. Setup | `references/1-setup.md` | Branch, scratchpad, ralphchives search |
{%- if triggerParams.codesamples and triggerParams.xpversion %}
| 1b. Coder | _(ralph-codesamples-bootstrap skill)_ | Dispatch ralph-coder to bootstrap the codesamples .NET project |
{%- endif %}
| 2. Research | `references/2-research.md` | Dispatch ralph-researcher to produce the research report |
| 3. Write | `references/3-write.md` | Dispatch ralph-writer to implement changes and use ralph-validator |
{%- unless triggerParams.skip_review %}
| 4–5. Review | `references/4-review.md` | Three-reviewer gate (technical, style, IA), revision loop |
{%- endunless %}
| 6. Commit | `references/6-commit.md` | Pre-commit checks, commit, push |
| 7. PR | `references/7-pr.md` | Create ADO pull request |
| 8. Handoff & Exit | `references/8-handoff.md` | Dispatch ralph-scribe, deliver to JIRA, print exit block |

**Before entering each phase:**
1. Read `state.md`
2. Read the **ralph-workflow** skill to find the reference file for your current phase
3. Read the reference file and follow its instructions
4. Update `state.md` as directed by the reference file's "Before moving to Phase N" section
