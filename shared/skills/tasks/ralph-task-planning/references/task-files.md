# Task Files

The planner produces two outputs:

- `tasks.json` as the machine-readable task index
- one markdown file per task for the writer and reviewers

## `tasks.json`

Use this shape:

```json
{
  "mode": "standard|revision",
  "task_count": 3,
  "tasks": [
    {
      "id": "TASK-01",
      "title": "Update page builder cache guidance",
      "path": "ralph-planner/task-01-update-page-builder-cache-guidance.md",
      "depends_on": [],
      "files": [
        "src/_documentation/..."
      ],
      "type": "documentation"
    }
  ]
}
```

Rules:
- Keep task IDs stable and ordered.
- `path` must match the real task file.
- `files` should name the expected file ownership, not every possible incidental edit.
- `type` should help the writer and reviewers understand the task shape quickly.

## Task file format

Use this structure:

```markdown
# Task TASK-01: <Task Name>

**Depends on**: None | TASK-XX, TASK-YY
**Type**: Documentation | Codesamples | Mixed | Release notes
**Primary research artifacts**:
- `ralph-researcher/output.md`
- `ralph-researcher/<other-artifact>.md`

## Objective
<1-2 sentences>

## Scope
- Files expected to change:
  - `path/to/file.md`
- Files expected to be created:
  - `path/to/new-file.md`

## Constraints
- `_guides` is out of scope
- Preserve prior approved task work
- Keep changes limited to this task's files and directly necessary cross-references

## Execution Steps
1. <specific step>
2. <specific step>
3. Run `npm run build`.
4. If `.cs` files changed, run `npm run codesamples:build`.
5. Run the validator for this task.

## Acceptance Criteria
- [ ] <criterion>
- [ ] <criterion>

## Reviewer Focus
- Technical: <what the technical reviewer should verify>
- Style: <what the style reviewer should verify>
- IA: <what the IA reviewer should verify>

## Follow-ups
<Only for intentionally deferred work>
```

## Quality bar

A task file is good when:
- a fresh writer can execute it without chat history
- reviewers can tell what they are auditing
- the task owns a coherent slice of work
- deferred work is explicit instead of hidden
