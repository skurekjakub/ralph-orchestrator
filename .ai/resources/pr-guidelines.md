# Pull request guidelines

> **Adapt me.** Agents follow this file whenever they open or update a pull
> request. Keep it short.

- **Title:** `<ISSUE-KEY> - <title>` when a tracker issue is associated;
  otherwise a plain imperative title.
- **Body:** bullets only; one sentence per bullet, one bullet per change.
- **Length:** stay under 4000 characters. This is a brevity budget, not an
  API limit: PRs for this repo go to GitHub (`skurekjakub/ralph-orchestrator`),
  and no hook checks the length.
- **Headings** (`## `) only when there are two or more distinct concerns.
- **Verification:** end with one `## Verification` bullet naming the commands
  that ran and their result — `npm test`, plus `lint` / `test` / `build` in
  each sub-project the PR touches (CI's `pr-validation.yml` runs them all).
- **Out of scope:** findings this PR does not fix go in a work item, not the
  body.
