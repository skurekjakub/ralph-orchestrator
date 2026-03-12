# Router Template

Use this structure for the generated top-level `SKILL.md` in the new reference skill.

## Goal

The router file should help an agent choose the right reference quickly. Keep it concise. Do not duplicate the full contents of the reference files.

## Required Sections

### Frontmatter

Include:

- `name`
- `description`

The description should be slightly pushy about when to use the skill.

### Opening Summary

State:

- what repository or surface the skill covers
- what kind of orientation it provides
- what the reference files contain

### Area Index

Organize the references into a small number of groups if needed.

For each reference, include:

- link to the file
- one-line description of what it covers

## Recommended Shape

```markdown
---
name: <skill-name>
description: <when to use it and what it does>
---

# <Title>

Short explanation of what this skill maps.

## Area Group 1

- [Area name](references/<file>.md) — one-line description
- [Area name](references/<file>.md) — one-line description

## Area Group 2

- [Area name](references/<file>.md) — one-line description
```

## Router Rules

- Keep it short enough to scan quickly.
- Put detail in the reference files.
- Group by user-facing concept, not by incidental folder names, when possible.
- If the repo naturally splits into audiences, reflect that in the router.
- If an area is especially foundational, list it early.
