# Seats — who does what, on which model

> **Adapt me.** Shared by `feature-development`, `project-bugfixing`,
> `codebase-refactoring` and `codebase-analysis`. Read before the first
> dispatch of a run.

## Routing

Every review and implementation seat is a `rubber-duk-*` agent from
`.claude/agents/`, never `general-purpose` — a generic agent carries none of
the repo's conventions and re-litigates what the roster already knows. If a
seat's agent isn't installed, say so and do that seat's work inline.

| Seat | Agent | Mode |
|---|---|---|
| General code review (every run) | `rubber-duk-review` | read-only |
| Security surface touched | `rubber-duk-auditor` | read-only |
| Server / non-UI implementation or review | `rubber-duk-backend` | IMPLEMENT / REVIEW |
| UI implementation or review | `rubber-duk-frontend` | IMPLEMENT / REVIEW |
| New or changed unit/integration tests | `rubber-duk-tests` | WRITE / AUDIT |
| New or changed e2e specs | `rubber-duk-e2e` | WRITE / HEAL / AUDIT |

## Test authoring

A new test file or a new test block is written by `rubber-duk-tests` (WRITE)
or `rubber-duk-e2e` (WRITE) and audited by the same agent in AUDIT mode. The
orchestrator writes a test inline only when changing assertions inside an
existing test block. Whoever writes it, the orchestrator watches the test fail
before the fix and pass after.

## Models

Pass `model` explicitly on every dispatch — an omitted `model` inherits the
session's, never the intended choice.

| Work | Model tier |
|---|---|
| Mechanical inventory, fix commits from an accepted finding | fast / economical (e.g. `sonnet`) |
| Review seats, security audit, negative-proof regression tests, refuting a framework claim | strong reasoning (e.g. `opus`) |
| Whole-branch final review of a large change | the most capable model available |

Scale down when the surface is small and well-trodden; scale up when a wrong
answer would be expensive to discover later.

## Every dispatch prompt

- Names `docs/conventions/comment-policy.md` and requires reading it first.
- Names the files in scope and the files explicitly out of scope.
- Names where the output goes (a report path, or "reply only").
- States the verification command to run and that its output is part of the
  report.
- For parallel implementers: `isolation: "worktree"`, disjoint file ownership,
  and the branch to merge into.
