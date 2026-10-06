# Follow-ups

Deferred work: every finding, found bug or improvement a run chose not to do,
written down so it survives the session. The orchestrator writes these, never
a subagent.

- **Location:** `.ai/followups/<domain>/<slug>.md`, in the primary
  checkout (never a worktree — it is deleted when its branch merges and takes
  untracked files with it).
- **Domains:** the domains of `.ai/feature-constitution/README.md`, plus
  `cross-cutting/` for a finding that genuinely spans them.
- **Slug:** states the problem, not the fix, and carries no number — two runs in
  two worktrees would both take the next free number. A sweep with a lens
  prefixes it (`perf-<slug>.md`).
- **Untracked:** `.gitignore` covers everything here except this README. A
  follow-up never enters a commit, a spec, a plan or another file's "out of
  scope" list — a finding hidden in prose is a finding lost.

## File shape

The first line under the title is the provenance line: what surfaced the
finding, and when. Then, in order:

1. **Problem** — what is wrong, verified, with locators that resolve.
2. **Cost** — measured, with the method.
3. **Callers / surface** — every place that pays it.
4. **Resolution options** — each with trade-offs, one recommended. Replaced by
   `## Resolution (user-directed, <date>)` once the user decides.
5. **Solution** — enough that an implementer can start without re-research:
   code, tests to add, verification steps, commit/PR notes, and which workflow
   to run (`feature-development` or `codebase-refactoring`).

`codebase-analysis/references/followup-template.md` has the full section-by-
section contract.

## What is not a follow-up

- A task already in the current plan.
- "Would be nicer" with no cost and no failure scenario.
- A tracker issue someone already filed — link it from the work instead.
