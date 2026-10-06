# Comment policy

> **Adapt me.** The `rubber-duk-*` agents grade every comment a diff adds
> against this file. Tighten or loosen it to match your team, then keep it the
> single source of truth.

Comments come in two shapes. Anything else is a finding.

## 1. Doc comments on functions — API documentation

- **Required pattern:** every exported function (and every non-trivial internal
  one) gets a doc comment in the language's standard form (JSDoc/TSDoc,
  docstrings, XML docs…): a one-line summary of what it does, then each
  parameter whose meaning the name doesn't carry (units, range, what `null`
  means), what it returns, and how it fails (`@throws` or equivalent).
- **Forbidden pattern:** restating the signature (`@param id - The id.`),
  describing the implementation step by step, or naming callers.

## 2. Inline comments — at gotchas only

- **Required pattern:** at most two lines, placed on the line that would
  surprise a careful reader: a workaround, an ordering constraint, a
  non-obvious invariant. An external constraint carries a locator (issue URL,
  spec section, bug number) that resolves.
- **Forbidden pattern:** narrating what the next line does, section banners,
  authorship, `TODO` without an owner or issue link. An inline comment that
  needs three lines is a function that wants extracting with a doc comment.

## The voice test

Apply it to every sentence: *would this still be true and useful if a
different caller used this function tomorrow?* If not, it is narrative, and
narrative has a destination other than the code:

| It's actually… | It goes in… |
|---|---|
| Why you chose this, alternatives rejected | the commit message or PR description |
| A behaviour that must keep working | a test, named for the behaviour |
| History ("was X, now Y", "after the refactor") | git log |
| A fact about today's data or deployment | nowhere, or a runbook |
| A plan / ticket / RFC reference | the PR description |

## No archaeology

When code is removed or replaced, remove every comment that mentions the old
shape, and write the remaining comments as if the code had always been this
way. No "replaces X", "now uses Y", "kept for compatibility with the old…".

## Tests

Test bodies are labelled by phase — `// Arrange`, `// Act`, `// Assert`
(`// Act & Assert` when one expression; no label for an absent phase). The
test name carries the behaviour; don't restate it in a comment. Existing
suites predate the labels: add them to tests you write or rewrite, not as a
sweep through untouched files.
