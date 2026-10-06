# Feature constitutions

One folder per feature at `<domain>/<slug>/`: the evergreen `README.md`
describing the feature as it exists now, its published `explainer.html`, and
the frozen journal of how it was built (`research.md`, `unknowns.md`,
`spec.md`, `plan*.md`). `feature-development` writes them; its
`references/constitution-folder.md` is the full convention.

## Domains

> **Adapt me.** Replace these starter domains with the handful that describe
> what *this* product is about for a reader. Keep the list short; a feature that
> fits none of them is evidence for a new domain, added here in the same
> branch. Never a `misc/`.

| Domain | Pick it when |
| --- | --- |
| `product/` | an end user sees or does something new |
| `integrations/` | it is about talking to an external system |
| `data/` | it changes how data is stored, validated or migrated |
| `platform/` | it changes how the app runs, builds or deploys, not what it does |
| `tooling/` | it only affects developers and agents working in the repo |

## Roster

Add a row in the same commit that adds a folder — an index that misses a folder
is worse than no index, because it is read as complete. Cross-reference other
constitutions as `[[slug]]`, never by path.

| Domain | Slug | One line |
| --- | --- | --- |
