---
name: ralph-task-planning
description: "Core planning skill for the Ralph docs planner sub-agent. Use this skill whenever research or revision feedback must be broken into headless execution tasks for the writer, when a documentation change needs to be decomposed into ordered task files, when you need to choose task boundaries, dependencies, deferred work, or reviewer focus sections, or when the writer/reviewer loop runs per task instead of across one monolithic implementation batch."
---

# Ralph Task Planning

Use this skill to turn research artifacts or revision feedback into an ordered, machine-friendly task plan for a fully headless Ralph docs run.

This skill is for the **planner**, not the writer. Your job is to decide:

- what the tasks are
- what order they should run in
- what each task owns
- what should be deferred instead of silently folded into another task
- what each reviewer should pay attention to for that task

Read the bundled references before planning.

## Read These References

| File | Purpose |
|---|---|
| `references/task-boundaries.md` | How to choose task granularity, ownership, and dependencies |
| `references/task-files.md` | The required headless task-file structure and `tasks.json` expectations |
| `references/revision-mode.md` | How to plan revision work from reviewer findings and preserve already approved work |

## Default Process

1. Inventory all available research or revision artifacts.
2. Group work by documentation neighborhood, file ownership, and dependency chain rather than by the order the researcher wrote things down.
3. Split risky mixed work into separate tasks when docs edits, navigation/frontmatter work, codesamples work, or release notes would otherwise be tangled together.
4. Emit explicit dependencies only when one task must land before another.
5. Mark genuinely out-of-scope work as follow-up instead of hiding it inside a task.
6. Write task files that a fresh writer can execute without chat history.
7. Include reviewer-focus notes so each reviewer can audit the right things per task.

## Rules

- Plan for **headless execution**. Do not write manual checkpoints, commit instructions, or user handoffs.
- Prefer **small, reviewable tasks** over large implementation batches.
- Keep `_guides` out of scope for Ralph docs planning.
- Minimize file overlap between tasks.
- Do not invent work that is unsupported by research or revision findings.
- If a task would be too vague to assign to a fresh writer, split it further.
- If multiple tasks touch the same file, explain why and make the dependency explicit.

## Expected Outcome

After using this skill, you should have:

- one ordered `tasks.json`
- one markdown task file per execution task
- clear deferred-work notes
- reviewer-focus guidance per task
- a plan that supports writer -> reviewer loops on one task at a time
