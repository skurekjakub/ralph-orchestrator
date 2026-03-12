# Phase 5: Task Breakdown

## Before you begin

1. Read `state.md` — verify this is Phase 5
2. Read the approved `01.specification.md` and `02.plan.md`
3. Review the implementation steps in the plan to determine natural task boundaries

## Instructions

### 1. Create the READBEFORE file

Write `03-tasks-00-READBEFORE.md` with essential context that a fresh coding agent needs before starting ANY task:

- Pointer to the specification (`01.specification.md`)
- Project-specific guidelines and conventions
- Key architectural decisions from the plan
- Build/test/lint commands
- Any global constraints (e.g., "all changes must be backward compatible")

This is the **boot sequence** for coding agents — they read this before their assigned task.

### 2. Break the plan into tasks

Create 5-15 independent task files: `03-tasks-01-[name].md`, `03-tasks-02-[name].md`, etc.

Each task file structure:

```markdown
# Task [N]: [Task Name]

**Depends on**: Task [M], Task [K] (or "None" if independent)
**Estimated complexity**: Low | Medium | High
**Type**: Feature | Refactoring | Testing | Documentation

## Objective
[1-2 sentences: what this task achieves]

## ⚠️ Important information
Before coding, Read FIRST → Load [03-tasks-00-READBEFORE.md](03-tasks-00-READBEFORE.md)

## Files to Modify/Create
- `path/to/file1.py`
- `path/to/file2.py`

## Detailed Steps
1. Update `PROGRESS.md` to mark this task as 🔄 In Progress
2. [Specific step with file and function/class references]
3. [Next specific step]
4. [Validation step: tests pass, preflight checks pass]
5. Run `just preflight` and fix any issues until it passes
6. Update `PROGRESS.md` to mark this task as ✅ Completed
7. Commit: `feat: implement task NN - [description]`

## Acceptance Criteria
- [ ] [Criterion 1]
- [ ] [Criterion 2]
- [ ] Tests pass
- [ ] Documentation updated

## Testing
- **Test file**: `tests/path/to/test_file.py`
- **Test cases**: [list specific test scenarios]

## Notes
[Additional context, gotchas, or considerations]
```

**Task design principles:**
- Each task is **self-contained** — a fresh agent reads READBEFORE + task file and has enough context
- Tasks are **modular and resumable** — can be worked on independently
- Tasks include a **boot sequence** pointing to READBEFORE
- Expect the coding agent to be a **different agent** without your conversation context
- Include **all necessary context** in task files — DO NOT rely on chat history

### 3. Include a wrap-up task

The final task generates `04.commit-msg.md` and `05-gitlab-mr.md`.

**Commit message** (`04.commit-msg.md`):
- Conventional commit format (`type(scope): description`)
- Focus on impact for users, not files changed
- Lines wrapped to 100 characters
- Concise, illustrative examples if applicable

**GitLab MR description** (`05-gitlab-mr.md`):
- Sections: Context, Changes, Usage, Impact, Examples
- Lines wrapped to 100 characters
- User-focused: how to use/enable the new feature
- Explain why the change was made and what it impacts

## When complete

Update `state.md`:
- Set "Current Phase" to `Complete`
- Add Phase 5 to "Completed Phases" with the total number of tasks created

Inform the user they can use the **"Start Implementation"** handoff to begin execution.
