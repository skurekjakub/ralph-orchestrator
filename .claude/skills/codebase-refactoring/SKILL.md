---
name: codebase-refactoring
description: >-
  Orchestrates the phased workflow for behavior-preserving change in ralph-orchestrator — decluttering, consolidation, module moves and renames, dead-code removal, dependency-cycle breaking. Use this skill whenever the user wants existing code improved rather than new behavior added: "refactor", "clean up", "declutter", "dedupe", "collapse these types", "dissolve this module", "move this somewhere sensible", "delete the dead code", "why do we have two of these", "knip says", "break this cycle", "this is scattered", "consolidate", "tidy", "reorganize", "unify". Also use when a feature's leftovers need retiring, or when the user names a module and asks whether it should still exist. Prefer this over `feature-development` whenever the deliverable is "same behavior, better shape" — the two flows differ in their central gate, and using the feature flow for a refactor skips the one check that matters most. Skip only for a single-file tidy no other file imports.
---

# Codebase refactoring

The deliverable of a refactor is **the absence of a behavior change**.
`feature-development` proves new behavior works; this proves nothing else
moved. Everything below makes that provable, not asserted.

Three parts plus reference files: **Ground rules** bind every phase, **the
journal** holds the artifacts, **the phases** order the work. The three
phases `feature-development` lacks — baseline, inventory, completeness
sweep — are where refactors are won or lost.

## Ground rules

### Code outranks documentation

**Verify every claim against the code, including this repo's own
documentation.** Convention docs, `.ai/diagrams/*`, and README prose go stale
exactly where refactors happen; treat a doc sentence as a hypothesis, `grep`,
`tsc`, and the dependency graph as evidence.

A diagram asserting records are addressed "never by slug", while the
resource descriptor declares `naturalKey: 'slug'` and the provider exposes
`get(codeName)`, is the shape of the failure: plausible, specific, wrong.

When doc and code disagree, code wins — the doc is stale.

### The docs are part of the diff

A refactor that moves or renames code and leaves the prose behind ships a
codebase that lies about itself. Convention docs (`docs/conventions/`), DoD
checklists (`.ai/dod/`), diagrams (`.ai/diagrams/`), and `CLAUDE.md` / `AGENTS.md` are
rules agents follow, so a stale locator there causes wrong work later, not
just confusion.

Every path, symbol, and relative link the refactor invalidates gets updated
in the same branch. Relative markdown links to source files are the
sharpest edge — they 404 silently and nothing checks them. Grep the old
path across all markdown, not just the docs you remember.

A doc wrong before the refactor started still gets fixed, noted in the
commit message — inherited staleness is still staleness once seen.

### Scope discipline

Refactors die of scope: the instinct that makes someone good at this work —
"and while I'm here" — turns a reviewable diff into an unreviewable one and
lands a behavior change nobody signed off on.

Test for each candidate change: **does the refactor's stated intent require
it?** If not, surface it and let the user decide. Record what you
deliberately leave broken in the spec's out-of-scope section (Phase 2), so a
reviewer can tell "missed" from "chose not to".

Two traps, and one non-trap:

- **A convention violation you're relocating.** Moving a function that
  already breaks a naming or caching convention doesn't oblige you to fix
  it — fixing it turns a path change into a semantic one. Move it as-is and
  file the violation as a follow-up, unless the user chooses otherwise.
- **A bug you found.** Report it and file it as a follow-up. Fixing a bug
  inside a behavior-preserving refactor makes the "nothing changed" claim
  false and hides the fix in a diff nobody reviews for logic.
- **A sync→async flip is not scope creep.** Propagating `await` up a call
  chain is a shape change the refactor makes in place whenever its intent
  needs an async read on that chain — not a behaviour change, never filed
  as a follow-up to keep the refactor "pure". The follow-up-worthy
  violation is the opposite: a sync accessor or preloaded snapshot standing
  in for the flip. `.ai/agent-working-rules.md` § Design rulings
  is the rule; its one exception is a boundary this repo doesn't own.

Anything deferred — a relocated violation, a found bug, an improvement
outside the refactor's intent — the orchestrator (never a subagent) writes
to `.ai/followups/<domain>/<slug>.md`, per `.ai/followups/README.md`; it
never hides as inline prose in `spec.md`, `plan.md`, `README.md`, or
documentation.

### Seats: who does what, on which model

Every review and implementation seat is a `rubber-duk-*` agent, never
`general-purpose`, with `model` passed explicitly on every dispatch. Read
`.ai/resources/skills/seats.md` before the run's first dispatch — the seat
per phase, review routing by surface, and model tier all live there.

Execution depends on the `superpowers:*` skills the phase table below
names. If one is unavailable, say so and ask via `AskUserQuestion` before
continuing.

## The journal

`.ai/refactoring/NNN-<slug>/` — not `.ai/feature-constitution/`. A refactor
ships no new behaviour, so it has no feature to specify, and filing it
beside feature specs would make every reader check whether the design
changed.

**Picking the number:** `ls .ai/refactoring/`, take the highest existing
prefix, add one. Zero-padded, three digits, creation order — the scheme
`.ai/bugfixes/` uses too, with its own independent sequence. Never
renumber, never reuse an abandoned number.

Artifacts: `unknowns.md` (Phase 1.5, absent when the pass was skipped),
`spec.md` (Phase 2), `plan.md` (Phase 3), a `README.md` describing the
code's current shape (Phase 7), and `explainer.html`, the published page
the user reads instead of the diff (Phase 7). Prefer appending to an
existing `.ai/refactoring/NNN-<slug>/` when a later sweep covers the same
ground — repeated one-off folders drift into near-duplicates.

### `explainer.html` — the contract

Write it to `.ai/refactoring/NNN-<slug>/explainer.html`. Read
`.ai/resources/skills/explainer-contract.md` before drafting it — the
template location, the four fixed sections in required order, and the
title and publishing rules all live there.

Read `.ai/feature-constitution/` for design context on whatever you're
moving; updates to the parent feature's `README.md` happen in Phase 7,
documenting the final shape — don't add refactor journal artifacts there.
Constitutions group by domain — `.ai/feature-constitution/<domain>/<slug>/`,
domains rostered in `.ai/feature-constitution/README.md`. Start
there, not by globbing: one subsystem's refactor usually touches one
domain's constitutions, and the roster finds every one in its blast radius
fastest.

## The phases

| # | Phase | Skill / tool | Artifact | Skip when |
|---|---|---|---|---|
| 0 | Baseline | repo gate commands | recorded numbers | never |
| 1 | Inventory | `Grep` / `Glob` / dep graph | recorded in `spec.md` (Phase 2) | never |
| 1.5 | Map unknowns | `mapping-unknowns` | `.ai/refactoring/NNN-<slug>/unknowns.md` | the person waves it off in a sentence — record the skip, never argue |
| 2 | Spec | write it directly | `.ai/refactoring/NNN-<slug>/spec.md` | never |
| 2.5 | Spec review | `rubber-duk-*` + `superpowers:receiving-code-review` | findings folded into the spec | never |
| 3 | Plan | `superpowers:writing-plans` | `.ai/refactoring/NNN-<slug>/plan.md` | never |
| 4 | Isolate | `superpowers:using-git-worktrees` | — | already on an isolated refactoring branch or worktree |
| 5 | Execute | `superpowers:subagent-driven-development` | commits | never |
| 5.5 | Completeness sweep | `Grep` | — | never |
| 6 | Review | `superpowers:requesting-code-review` + `superpowers:receiving-code-review` + `rubber-duk-*` | — | never |
| 7 | Finish | `.ai/resources/skills/explainer-template.html` + `Artifact` + `superpowers:finishing-a-development-branch` | `.ai/refactoring/NNN-<slug>/README.md` + parent feature `README.md` (if affected) + updated `.ai/diagrams/*` + touched `.ai/dod/` checklists + `explainer.html`, published | never |

### Phase 0 — Baseline

Record what green looks like **before touching anything** — a number to
compare against, not just "it still passes."

The orchestrator runs the repo's static gate and records the actual
figures (test count, module and dependency counts from the cycle checker,
pre-existing warnings) in the session context, committed into
`.ai/refactoring/NNN-<slug>/spec.md` under Verification in Phase 2. Read
`package.json` scripts to learn the gate rather than assume — it changes
over time and by branch.

Two things to establish:

- **Pre-existing failures.** A red baseline is not a blocker, but it must
  be known and named or it gets blamed on the refactor later.
- **Coverage over what you're about to move.** Where the code has no test
  that would fail if you broke it, that's the gap the refactor is blind
  in. Dispatch `rubber-duk-tests` (WRITE) (or `rubber-duk-e2e` (WRITE) for
  browser flows) to write a characterization test first — pinning current
  behavior, quirks included — or record in the spec why moving unguarded
  is acceptable. A pure type- or path-level move can go unguarded because
  the compiler is the test; a logic move can't.

### Phase 1 — Inventory as data, not prose

The dominant failure mode is the **partial** refactor: the definition
changes but some call sites don't, so the contract at the changed site
diverges silently from the unchanged ones.

Defend against it by making completeness checkable before any edit. The
orchestrator compiles the inventory as a concrete, counted list (every
importer, call site, locator) embedded directly into
`.ai/refactoring/NNN-<slug>/spec.md` under Refactoring & reorganization,
then validates it before executing: paths resolve, symbols exist, the
count matches a second independent query. This is the plan-validate-execute
shape; the intermediate artifact is what makes the plan falsifiable.

Cast wider than the import graph. Things that reference code without importing it:

- string literals and template literals naming a module or symbol
- dynamic `import()` and `require()` with computed paths
- config files — bundler, test runner, lint, dead-code tool, path aliases
- file-tracing and asset globs in framework config
- markdown links from docs to source files, and doc prose naming paths or symbols
- test fixture keys, snapshot names, allowlists pinned by path

`references/completeness-sweep.md` has the concrete query patterns and the
TypeScript-specific traps.

### Phase 1.5 — Map unknowns

Invoke `mapping-unknowns` once the inventory exists — the baseline and
inventory already cover the territory the pass needs to read. For a
refactor the map's rows track the person's knowledge of the
current shape and its consumers: which quirks they mean to preserve, which
regressions they'd recognise only on sight, which consumers outside the
import graph they never considered. One question per message; close with
the decisions they now own and the pattern that comes next. Save the final
map and brief to `.ai/refactoring/NNN-<slug>/unknowns.md`; the spec's "what
must not change" and out-of-scope lists start from it.

The gate is soft. Offer the pass every time and never argue for it: when
the person waves it off in a sentence, write `Unknowns pass: skipped by the
person` as the first line of `spec.md` in Phase 2 and write no
`unknowns.md`.

### Phase 2 — Spec

The spec's job differs from a feature spec: it records **what must not
change** and **why the current shape is wrong**, then the target shape.

Include:

- **Intent** — the concrete defect in the current shape: "duplicated", "two
  declaration sites", "a cycle", "dead". Name it by what it costs someone
  editing this code, not aesthetics.
- **What is actually there** — an honest classification of the code in
  scope. Refactors routinely find a module holding four unrelated kinds of
  thing, each wanting a different destination. Classify before deciding.
- **Design** — the target shape, and the evidence for each destination.
  Every "X belongs in Y" claim carries a code-verified reason.
- **Refactoring & reorganization** — the target tree, the rename list
  (old → new), and the ripple inventory from Phase 1.
- **Verification** — the gate, plus the specific check that proves *this*
  refactor complete (a `grep` that must return nothing, a cycle count that
  must not rise).
- **Out of scope** — what stays broken on purpose. A refactor that fixes
  everything it touches never lands.
- **Corrections** — when the spec review falsifies a claim, record the
  correction and reasoning. The journal's value is the reasoning; a spec
  that quietly deletes wrong claims teaches nobody.

### Phase 2.5 — Spec review (mandatory)

Mandatory: a wrong premise caught here costs a spec edit; caught in Phase 6
it costs a rewrite of shipped code.

Dispatch the `rubber-duk-*` reviewers `.ai/resources/skills/seats.md`
names, in parallel, each pointed at the spec path with an adversarial
mandate. State which you skipped and why.

Read `references/spec-review-claims.md` before writing the reviewer
mandates — it lists the load-bearing claim types a spec review must
enumerate and falsify with `file:line` evidence, and the one claim a
reviewer must not make.

Then process findings through `superpowers:receiving-code-review` with
real rigor: verify each against the code yourself — reviewers are wrong
too, and a confidently cited doc sentence is a common way to be wrong.
Refute bad findings with evidence, fold good ones in. A spec does not
advance with an unaddressed BLOCKER or IMPORTANT.

### Phase 3 — Plan

Invoke `superpowers:writing-plans`, saving to
`.ai/refactoring/NNN-<slug>/plan.md`.

Sequence so **every commit leaves the tree consistent**. The tree must
never hold two parallel structures — a half-migrated state is the
partial-refactor failure with a commit boundary through the middle. Each
task pairs its move with its importer updates and its own verification.

Order by dependency, not convenience: a rename many files consume lands
before the moves that would multiply its call sites.

### Phase 4 — Isolate

Invoke `superpowers:using-git-worktrees`, or confirm the workspace is
already isolated on a dedicated feature or refactoring branch rather than
`main`. A refactor touching many files wants a branch that can be
abandoned cheaply.

### Phase 5 — Execute

Mirror the plan into the task tracker before touching code, one tracked
task per plan task, marked in-progress and complete as they land — never
batch-completed.

Invoke `superpowers:subagent-driven-development`. Refactor tasks suit it
well: the plan carries the exact moves, so most tasks are mechanical. The
orchestrator dispatches a review subagent after each task rather than
batching, following `.ai/resources/skills/seats.md` for reviewer
selection, model scaling, and prompt requirements.

Extensive test generation is delegated to `rubber-duk-tests` (WRITE) for
Vitest suites or `rubber-duk-e2e` (WRITE) for Playwright suites, not
hand-authored by the orchestrator.

### Phase 5.5 — Completeness sweep (mandatory)

Rename and move tooling doesn't touch string literals, comments, or
dynamic references — IDEs exclude dynamic usages from rename by default.
The sweep is required, not paranoia.

For every symbol and path that moved or was renamed, grep the **old** name
as raw text across the whole repo including docs, config, and fixtures.
Expected result: zero hits; every hit is either a site the refactor missed
or a deliberate exception you can name.

Then re-run the Phase 0 gate and compare against the recorded baseline:
equal or better on every number. A dropped test count means tests stopped
running, not that they stopped being needed.

See `references/completeness-sweep.md` for query patterns.

### Phase 6 — Review

1. `superpowers:requesting-code-review` against the branch base.
2. `rubber-duk-review` over the full branch diff — mandatory, every refactor.
   In parallel, dispatch domain passes per `.ai/resources/skills/seats.md`:
   `rubber-duk-backend` (REVIEW) for server/lib/build changes,
   `rubber-duk-frontend` (REVIEW) for UI, and `rubber-duk-auditor` when
   security surfaces are touched.
3. `superpowers:receiving-code-review` to process, with rigor rather than
   performed agreement.
4. `rubber-duk-tests` (AUDIT) for unit/integration test changes, and
   `rubber-duk-e2e` (AUDIT) for e2e test changes, whenever test files are modified or
   added.

Findings specific to this flow, which a reviewer should be asked to hunt:

- a behavior change smuggled into a move — the diff should be relocations
  and renames; logic edits inside a moved block need naming and justifying
- an unjustified sync escape hatch added to avoid an async flip
- an old structure left standing beside the new one
- a compatibility alias or re-export shim kept for an old name —
  single-repo code has no external consumers, so the alias is the hop the
  refactor exists to remove
- an archaeology comment (`// moved from`, `// was X`, `// kept for
  compatibility`) naming the old location — the diff and git log already
  record the move
- doc locators the move broke

### Phase 7 — Finish

The orchestrator writes `.ai/refactoring/NNN-<slug>/README.md` describing
the current shape against the code, not edited from the spec — no
changelog, no "was previously" framing. Update the parent feature's
`README.md` too if the refactor changed a shape it describes.

Then bring `.ai/diagrams/` back in line: open every diagram whose
subsystem the refactor touched and verify each path, module, function, and
route it names still resolves — `grep` or `ls` each one, don't trust the
diagram's own claim. A diagram naming a module this refactor deleted is
confidently wrong and read as truth.

Then walk the definition of done — the last gate. Open every `.ai/dod/`
checklist whose surface the refactor touched and check it item by item
against the branch diff: a **must** item is met or the refactor isn't
done; an **if relevant** item is met or you state why not. A move onto a
new surface inherits that surface's checklist. Fix the code to earn a
tick — editing the checklist so the work passes is never the answer.

Then write and publish `explainer.html` per the journal section's
contract, once the final review is clean and `npm test` has exited 0
on the final tree — the figures it cites are the figures that ship. Hand
the user the URL.

Then `superpowers:finishing-a-development-branch`, so constitution,
diagrams, explainer and implementation land together. The explainer URL
goes in the PR body; once the PR exists, comment on the tracker issue (if
the work has one) with the PR link and the explainer link.

## Reference files

- `references/completeness-sweep.md` — query patterns for finding every reference
  including the ones outside the import graph, and the TypeScript-specific traps.
- `references/decluttering.md` — dead-code tooling behavior, safe ordering, and
  distinguishing real unused exports from false positives.
- `references/spec-review-claims.md` — the claim types a Phase 2.5 spec review
  must enumerate and falsify, and the one claim a reviewer must not make.
- `.ai/resources/skills/seats.md` — the seat per phase, review routing by
  surface, and model tier per seat.
- `.ai/resources/skills/explainer-template.html` — the explainer's tokens,
  both themes, the four fixed sections as `FILL:` slots, and the quiz
  component. Shared with `feature-development` and `codebase-analysis`.
