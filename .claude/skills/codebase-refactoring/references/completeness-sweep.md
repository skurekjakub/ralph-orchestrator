# Completeness sweep

How to prove you found every reference to something you are moving, renaming, or
deleting — including the references that are invisible to the import graph.

## Contents

- Why the import graph is not enough
- Building the inventory (Phase 1)
- The sweep after the edit (Phase 5.5)
- TypeScript-specific traps
- Repo-specific locator classes

## Why the import graph is not enough

`tsc` proves that everything the type system can see still resolves. It cannot
see a path inside a string, a glob in a config file, or a markdown link. Rename
tooling has the same blind spot by construction: IDEs exclude dynamic usages from
rename by default, and string literals and comments are opt-in.

So the compiler passing is necessary and not sufficient. The gap it leaves is
exactly where a partial refactor hides: the code compiles, the tests pass, and a
config glob or a doc link now points at nothing.

## Building the inventory (Phase 1)

Count first, then act. The point is a number you can re-derive independently, so
"did I get them all" has an answer.

### Importers, per module

Quote the closing delimiter so `foo` does not also match `foo-bar`:

```bash
git grep -l "@/lib/thing/registry'" -- <every source, script and test root>
```

Do this per module rather than for the directory, then also take the union — a
file may import two modules from the same directory, so per-module counts sum to
more than the file count. Report both, and say which is which.

### Symbol occurrences vs files

`git grep -l` counts files; `git grep -c` counts lines; neither counts
occurrences. When a rename's blast radius matters, say which you measured. A
plan that says "12 sites" and means "12 files, 37 occurrences" invites a reviewer
to think a sweep was incomplete.

### The dependency graph

Ask the checker, not your reading of the imports. In a JS/TS repo with
dependency-cruiser:

```bash
npx depcruise --config .dependency-cruiser.cjs --progress none <source roots>
```

Other ecosystems have equivalents (import-linter, `go list -deps`,
jdeps…). No checker at all is a baseline finding worth recording.

Record the module and dependency totals — they are the baseline that proves you
did not add a cycle or orphan a subtree.

Two things people get wrong here:

- **A module cycle is not a directory back-edge.** `a/x.ts → b/y.ts → a/z.ts` is
  a chain, not a cycle, and the checker will not report it. "Moving this would
  create a cycle" is a claim about specific modules; verify it by finding the
  actual loop, or drop the argument.
- **A clean baseline is evidence.** If the graph is cycle-free before the move
  and the move only changes paths, it stays cycle-free — which also means a
  cycle-free baseline proves two modules do *not* currently reach each other.

## The sweep after the edit (Phase 5.5)

For every old path and old symbol, grep the whole repo as raw text. Expected
result: zero hits. Every hit is a missed site or a named exception.

```bash
# old module path, anywhere at all — including docs, config, fixtures
git grep -n "lib/thing/"

# old symbol name as raw text, not as an import
git grep -n "\bblocksDelete\b"

# markdown links pointing at source files that moved
git grep -nE "\]\([./]+.*lib/thing" -- '*.md'
```

Use `grep -E` for anything with `(`, `)`, `|`, `+`, or `?` in the pattern. In
basic regex those are literals, so `']\(http'` silently matches nothing and the
absence of output reads as a clean result. Verify a pattern matches something you
know exists before trusting that it matched nothing.

Then re-run the full gate and compare every number against the Phase 0 baseline.
Equal or better. A test count that fell means tests stopped running.

## TypeScript-specific traps

**`z.infer` of an optional schema is not the non-null type.** When `.optional()`
is applied inside the schema const, the inferred type is `{…} | undefined`, and
`keyof` over that union is `never`. A `Partial<Record<keyof T, string>>` built on
it collapses to `{}` and any indexed write stops compiling. Move `.optional()` to
the field's use site and infer off the bare object, or wrap in `NonNullable`.
Probe type identity with a mutual-assignability check rather than reasoning about
it.

**Barrel re-exports hide the real consumer.** Nothing may import a symbol from
the module that declares it while eight things import it from an `index.ts`. A
precedent argument built on "consumed directly" needs the barrel checked first.

**Type-only imports are erased.** `import type` from a `server-only` module in a
client component is safe and does not pull the module into the client bundle.
Don't report it as a leak, and don't rely on it being absent as proof that no
client code depends on the shape.

**Path aliases have two spellings.** `@/lib/x` and a relative `../x` resolve to
the same module. Grep both.

**Test fixtures and allowlists pin paths as data.** A client-safety allowlist, a
snapshot key, or a fixture keyed by module path does not appear in the import
graph and will not fail to compile.

## Locator classes

Things that name source paths without importing them — check every one the
repo has:

| Where | Why it bites |
|---|---|
| `docs/conventions/*.md` | These are rules agents follow. A stale path makes the convention wrong, not just confusing. |
| `.ai/dod/*.md` | Checklist items in `must` form naming helpers by path and symbol. |
| `.ai/diagrams/*.md` | Read as ground truth for orientation before touching a subsystem. |
| `CLAUDE.md` / `AGENTS.md` | Loaded into context every session. Stale content here misdirects every agent. |
| Relative markdown links | `[label](../lib/thing.ts)` 404s silently; nothing validates them. |
| Bundler / framework config | Tracing, include/exclude and ignore globs (for example `next.config.*` `outputFileTracingIncludes`). |
| Dead-code tool config | `entry` / `project` globs (for example `knip.json`) decide what the analysis can see. |
| Dependency-graph checker config | The path list passed to the checker. |
| CI pipeline definitions | Jobs naming paths or files directly. |
| `package.json` scripts | Scripts naming files directly. |

`.ai/feature-constitution/*/*/spec*.md` and `plan*.md` are frozen journals —
correctly out of scope. Their `README.md` is not. The extra path segment is the
domain: constitutions live at `<domain>/<slug>/`, so a one-star glob matches
the domain directories and nothing else.
