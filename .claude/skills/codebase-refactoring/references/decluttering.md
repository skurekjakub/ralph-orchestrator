# Decluttering — ordering and graph checks

**If the repo has a dead-code convention doc under `docs/conventions/`, read
it first** — its config shape, confirmed false positives and `--fix` rules
outrank this file. This file covers the order to work in, the dependency-graph
checks, and the judgement calls around "dead". Examples use knip and
dependency-cruiser (JS/TS); other ecosystems have equivalents.

## Contents

- Safe ordering, and why
- Cycles and coupling
- What "dead" does not mean
- Sweep-specific scope traps

## Safe ordering, and why

Work outward from the coarsest unit. Risk is concentrated unevenly, and this
order front-loads the value while deferring the part that needs the most
verification:

1. **Whole unused files.** Highest value, lowest risk — nothing imports the file,
   so nothing breaks in a way the compiler misses. Delete, re-run the gate.
2. **Unused / unlisted dependencies.** `package.json` hygiene. Check consumers
   outside the import graph before removing: a bundler plugin, a formatter, or a
   CLI tool referenced by name in a script never appears in an import.
3. **Unused exports, last, in small batches.** Where false positives cluster.
   Batch them small enough that a gate failure points at an obvious culprit.

The reason exports go last: static analysis cannot see a dynamically-reached
consumer, so a wrong deletion there fails at runtime rather than at compile time.
Files and dependencies fail loudly; exports can fail quietly.

Note the difference in tools' fix modes: `knip --fix --fix-type
exports,types` only strips the `export` keyword, which is safe because the
compiler and `no-unused-vars` then surface what became genuinely unused. That is
a different operation from letting a tool delete files in bulk — the first is
reversible and checked, the second is not.

## Cycles and coupling

Ask the checker rather than reasoning about the imports — for example
dependency-cruiser with a `no-circular` rule at error severity, wired into
`npm test` so a cycle fails the gate. If the repo has no cycle check,
record that in the baseline.

Record the module and dependency totals as part of the Phase 0 baseline. A total
that moves unexpectedly means the change pulled something new into the graph.

Two distinctions that decide arguments about proposed moves:

- **A module cycle is a loop between specific modules.** `a/x → b/y → a/z` is a
  chain. Directory-level "back-edges" are not cycles and are not reported. "This
  would create a cycle" is a claim about named modules — find the loop or drop
  the claim.
- **A clean baseline is a proof of absence.** If the graph is cycle-free before a
  path-only move, two modules in it demonstrably do not reach each other today.
  That is stronger evidence than reading imports by hand, and it also means a
  path-only move cannot introduce a cycle.

## What "dead" does not mean

Things that look dead to static analysis and are not:

- Code reached only from content or templates read through `fs` at runtime
  (markdown/MDX, templates) — never statically imported, so outside the
  analysed project by design.
- A route, page, or layout the framework mounts by file location.
- Anything named by a string in config, or reached by a computed dynamic import.
- An inline `import('@/lib/…').SomeType` — invisible to the graph. Rewrite
  these as static `import type`, not suppress them.

One thing that looks alive and is not: an export whose only consumer is a test
that exists solely to exercise it. That is a closed loop and both halves are
removable — but check first whether the behaviour has coverage through a real
caller, because sometimes the closed loop is the only test a live path has.

## Sweep-specific scope traps

- **A barrel whose re-exports all turn out dead** gets deleted, not left as an
  empty husk. Repoint its consumers at the concrete module.
- **Deleting dead code is not licence to fix the code around it.** The diff should
  be removals. A logic change smuggled into a sweep is invisible to review.
- **A finding you cannot explain is not a finding you may delete.** Verify the
  reason it is unreachable. "The tool said so" is a lead, not a
  justification — every finding is a lead to verify, not a fact to act on.
