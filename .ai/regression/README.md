# Manual regression suites

Click-through checks for behaviour automated tests don't reach well: one file
per domain at `.ai/regression/<domain>.md`, one checkbox per behaviour,
each with the route or entry point and the exact observation that counts as a
pass.

- A bugfix whose box passed while the bug was live tightens that box; a
  behaviour with no box gets one.
- Boxes describe observable behaviour ("the save button stays disabled until
  the form is valid"), never implementation.

```markdown
# <Domain> — regression

- [ ] <route or entry point> — <action> → <what you must see>
```
