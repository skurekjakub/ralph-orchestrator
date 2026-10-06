# Definition of done

Per-surface checklists walked item by item before a feature, fix or refactor
is called done. One file per surface: `.ai/dod/<topic>.md` (for example
`api-endpoint.md`, `ui-component.md`, `e2e-spec.md`).

- Items are written as **must** (met, or the work isn't done) or **if
  relevant** (met, or the report says why it doesn't apply).
- The code earns the tick. Editing a checklist so the work passes is the one
  move that is never allowed — a wrong item is changed in its own commit, with
  the reason.
- "No checklist covers this surface" is a valid outcome; say so in the PR body.

## Template

```markdown
# <Surface> — definition of done

- [ ] **must** — <a checkable statement, with the file or command that proves it>
- [ ] **if relevant** — <…>
```

> **Adapt me.** Add the first checklist the second time a reviewer catches the
> same omission on the same kind of surface.
